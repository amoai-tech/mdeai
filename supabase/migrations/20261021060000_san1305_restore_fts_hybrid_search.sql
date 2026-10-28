-- =============================================================================
-- Migration: 20261021060000_san1305_restore_fts_hybrid_search.sql
-- Task:      SAN-1305 · Make Rental, Event, and Restaurant Search Work After a
--            Fresh Database Rebuild
-- =============================================================================
-- Production search uses keyword matching (full-text) plus meaning matching
-- (pgvector), fused by Reciprocal Rank Fusion, in three functions:
-- hybrid_search_listings / _events / _restaurants. They read a generated
-- `fts_content` column on apartments, events and restaurants. Those columns, their
-- GIN indexes and the three functions were created directly in production, so a
-- clean rebuild had no search at all.
--
-- Everything below was read from the live project (read-only, 2026-10-16) and is
-- copied exactly, so this migration is a no-op on production except for one change:
-- the three functions lose the implicit PUBLIC execute right. anon, authenticated
-- and service_role keep EXECUTE, which are the roles the app calls them as.
--
--   * columns : `add column if not exists` -> no-op where the column exists.
--   * indexes : `create if not exists` with production's index names.
--   * functions: `create or replace` with production's exact bodies. They are
--     SECURITY INVOKER, so the caller's row security still decides which rows
--     are visible. Nothing is widened.
--   * hybrid_search_restaurants keeps production's own `search_path = public,
--     extensions` and development-phase rule (20261016110100), unchanged.
--
-- The helpers fts_spanish() and fts_array_to_text() already exist in
-- 20260530012233_data010_search_path_hardening.sql.
--
-- Forward-only and idempotent.
-- =============================================================================

-- 1 · generated full-text columns ---------------------------------------------
alter table public.apartments
  add column if not exists fts_content tsvector
  generated always as (
    public.fts_spanish(
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(neighborhood, '') || ' ' || coalesce(city, '')
    )
  ) stored;

alter table public.events
  add column if not exists fts_content tsvector
  generated always as (
    public.fts_spanish(
      coalesce(name, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(address, '') || ' ' || coalesce(event_type, '') || ' ' ||
      coalesce(subcategory, '')
    )
  ) stored;

alter table public.restaurants
  add column if not exists fts_content tsvector
  generated always as (
    public.fts_spanish(
      coalesce(name, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(address, '') || ' ' || public.fts_array_to_text(cuisine_types)
    )
  ) stored;

-- 2 · GIN indexes (production's names) ----------------------------------------
create index if not exists apartments_fts_idx  on public.apartments  using gin (fts_content);
create index if not exists events_fts_idx      on public.events      using gin (fts_content);
create index if not exists restaurants_fts_idx on public.restaurants using gin (fts_content);

-- 3 · the three hybrid search functions (production bodies; see the note on the vector schema) --
-- The vector extension lives in `public` on production but in `extensions` on a fresh local
-- Supabase database. These two bodies qualify the distance operator, so the schema is read from the
-- installed extension at migration time. On production this renders exactly `operator(public.<=>)`.
do $do$
declare
  v_vector_schema text := (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector');
begin
  if v_vector_schema is null then
    raise exception 'pgvector is not installed; cannot create hybrid_search_listings / hybrid_search_events';
  end if;
  execute format($ddl$
CREATE OR REPLACE FUNCTION public.hybrid_search_listings(query_text text, query_embedding vector, match_count integer DEFAULT 10, fts_weight double precision DEFAULT 1.5, semantic_weight double precision DEFAULT 1.0, rrf_k integer DEFAULT 60)
 RETURNS TABLE(id uuid, title text, description text, neighborhood text, city text, price_monthly numeric, bedrooms integer, bathrooms numeric, rating numeric, images text[], amenities text[], pet_friendly boolean, furnished boolean, status text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  fts as (
    select
      a.id,
      row_number() over (
        order by ts_rank_cd(a.fts_content, websearch_to_tsquery('spanish', query_text)) desc
      ) as rank
    from public.apartments a
    where a.status = 'active'
      and a.fts_content @@ websearch_to_tsquery('spanish', query_text)
  ),
  sem_raw as (
    select
      le.listing_id as id,
      le.embedding operator(%1$I.<=>) query_embedding as distance
    from public.listing_embeddings le
    inner join public.apartments a on a.id = le.listing_id
    where a.status = 'active'
    order by distance
    limit match_count * 3
  ),
  sem as (
    select id, row_number() over (order by distance) as rank
    from sem_raw
  ),
  rrf as (
    select
      coalesce(fts.id, sem.id) as id,
      coalesce(fts_weight  / (rrf_k + fts.rank), 0.0) +
      coalesce(semantic_weight / (rrf_k + sem.rank), 0.0) as rrf_score
    from fts
    full outer join sem using (id)
  )
  select
    a.id, a.title, a.description, a.neighborhood, a.city,
    a.price_monthly, a.bedrooms, a.bathrooms, a.rating, a.images,
    a.amenities, a.pet_friendly, a.furnished, a.status,
    rrf.rrf_score::float8 as similarity
  from rrf
  inner join public.apartments a on a.id = rrf.id
  order by rrf.rrf_score desc
  limit match_count;
$function$;
$ddl$, v_vector_schema);
  execute format($ddl$
CREATE OR REPLACE FUNCTION public.hybrid_search_events(query_text text, query_embedding vector, match_count integer DEFAULT 10, fts_weight double precision DEFAULT 1.5, semantic_weight double precision DEFAULT 1.0, rrf_k integer DEFAULT 60)
 RETURNS TABLE(id uuid, name text, description text, event_type text, address text, event_start_time timestamp with time zone, ticket_price_min numeric, rating numeric, primary_image_url text, tags text[], similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  fts as (
    select
      e.id,
      row_number() over (
        order by ts_rank_cd(e.fts_content, websearch_to_tsquery('spanish', query_text)) desc
      ) as rank
    from public.events e
    where e.is_active = true
      and e.event_start_time > now() - interval '1 hour'
      and e.fts_content @@ websearch_to_tsquery('spanish', query_text)
  ),
  sem_raw as (
    select
      ee.event_id as id,
      ee.embedding operator(%1$I.<=>) query_embedding as distance
    from public.event_embeddings ee
    inner join public.events e on e.id = ee.event_id
    where e.is_active = true
      and e.event_start_time > now() - interval '1 hour'
    order by distance
    limit match_count * 3
  ),
  sem as (
    select id, row_number() over (order by distance) as rank
    from sem_raw
  ),
  rrf as (
    select
      coalesce(fts.id, sem.id) as id,
      coalesce(fts_weight  / (rrf_k + fts.rank), 0.0) +
      coalesce(semantic_weight / (rrf_k + sem.rank), 0.0) as rrf_score
    from fts
    full outer join sem using (id)
  )
  select
    e.id, e.name, e.description, e.event_type, e.address,
    e.event_start_time, e.ticket_price_min, e.rating, e.primary_image_url,
    e.tags,
    rrf.rrf_score::float8 as similarity
  from rrf
  inner join public.events e on e.id = rrf.id
  order by rrf.rrf_score desc
  limit match_count;
$function$;
$ddl$, v_vector_schema);
end
$do$;

CREATE OR REPLACE FUNCTION public.hybrid_search_restaurants(query_text text, query_embedding vector, match_count integer DEFAULT 10, fts_weight double precision DEFAULT 1.5, semantic_weight double precision DEFAULT 1.0, rrf_k integer DEFAULT 60)
 RETURNS TABLE(id uuid, name text, description text, cuisine_types text[], address text, city text, price_level integer, rating numeric, primary_image_url text, dietary_options text[], ambiance text[], similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with
  fts as (
    select r.id, row_number() over (
      order by ts_rank_cd(r.fts_content, websearch_to_tsquery('spanish', query_text)) desc
    ) as rank
    from public.restaurants r
    where (r.is_active = true or private.mde_application_phase() = 'development')
      and r.fts_content @@ websearch_to_tsquery('spanish', query_text)
  ),
  sem_raw as (
    select re.restaurant_id as id, re.embedding <=> query_embedding as distance
    from public.restaurant_embeddings re
    inner join public.restaurants r on r.id = re.restaurant_id
    where (r.is_active = true or private.mde_application_phase() = 'development')
    order by distance limit match_count * 3
  ),
  sem as (select id, row_number() over (order by distance) as rank from sem_raw),
  rrf as (
    select coalesce(fts.id, sem.id) as id,
      coalesce(fts_weight / (rrf_k + fts.rank), 0.0) + coalesce(semantic_weight / (rrf_k + sem.rank), 0.0) as rrf_score
    from fts full outer join sem using (id)
  )
  select r.id, r.name, r.description, r.cuisine_types, r.address, r.city,
    r.price_level, r.rating, r.primary_image_url, r.dietary_options, r.ambiance,
    rrf.rrf_score::float8 as similarity
  from rrf inner join public.restaurants r on r.id = rrf.id
  order by rrf.rrf_score desc limit match_count;
$function$;

-- 4 · explicit, minimal EXECUTE -------------------------------------------------
-- Production grants EXECUTE to PUBLIC as well as anon / authenticated / service_role.
-- PUBLIC is the only right removed; the roles the app calls these as keep theirs.
revoke all on function public.hybrid_search_listings(text, vector, integer, double precision, double precision, integer)    from public;
revoke all on function public.hybrid_search_events(text, vector, integer, double precision, double precision, integer)      from public;
revoke all on function public.hybrid_search_restaurants(text, vector, integer, double precision, double precision, integer) from public;

grant execute on function public.hybrid_search_listings(text, vector, integer, double precision, double precision, integer)    to anon, authenticated, service_role;
grant execute on function public.hybrid_search_events(text, vector, integer, double precision, double precision, integer)      to anon, authenticated, service_role;
grant execute on function public.hybrid_search_restaurants(text, vector, integer, double precision, double precision, integer) to anon, authenticated, service_role;
