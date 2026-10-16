-- SAN-1523 · AI search sees development records (apartments and events)
--
-- hybrid_search_listings() and hybrid_search_events() are the live AI search paths. Both are live-only
-- (they depend on the generated column fts_content, which a fresh replay does not have), exactly like
-- hybrid_search_restaurants() in 20261016110100. They hard-filtered `status = 'active'` / `is_active = true`
-- in the keyword AND the vector path, so a development record could be embedded and still never be found.
--
-- Change: the business gate is dropped only while the server-owned phase is 'development'. Everything else
-- is the live definition (captured 2026-10-16 with pg_get_functiondef): signatures, result columns, the
-- reciprocal-rank-fusion ranking, SECURITY INVOKER, search_path ''. The rental gate follows the same
-- source the keyword path already uses (public.rental_development_active(), SAN-1502); the event gate
-- follows private.mde_application_phase() (SAN-1521). In launch both functions behave exactly as before.
--
-- Not changed on purpose: the events time window (a past event is not a search result, it is not a business
-- gate), RLS (the functions are SECURITY INVOKER, so each caller's row security still applies), and
-- semantic_search_listings/events (no caller in the app).
set search_path = public, extensions;

do $g1$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'apartments' and column_name = 'fts_content') then
    execute $ddl$
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
    where (a.status = 'active' or public.rental_development_active())
      and a.fts_content @@ websearch_to_tsquery('spanish', query_text)
  ),
  sem_raw as (
    select
      le.listing_id as id,
      le.embedding operator(public.<=>) query_embedding as distance
    from public.listing_embeddings le
    inner join public.apartments a on a.id = le.listing_id
    where (a.status = 'active' or public.rental_development_active())
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
$function$
    $ddl$;
  end if;
end
$g1$;

do $g2$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'events' and column_name = 'fts_content') then
    execute $ddl$
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
    where (e.is_active = true or private.mde_application_phase() = 'development')
      and e.event_start_time > now() - interval '1 hour'
      and e.fts_content @@ websearch_to_tsquery('spanish', query_text)
  ),
  sem_raw as (
    select
      ee.event_id as id,
      ee.embedding operator(public.<=>) query_embedding as distance
    from public.event_embeddings ee
    inner join public.events e on e.id = ee.event_id
    where (e.is_active = true or private.mde_application_phase() = 'development')
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
$function$
    $ddl$;
  end if;
end
$g2$;
