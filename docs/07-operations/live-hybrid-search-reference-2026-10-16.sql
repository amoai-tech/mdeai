-- READ-ONLY REFERENCE SNAPSHOT — NOT A DEPLOYABLE MIGRATION
-- Captured 2026-10-16 directly from live MDE Supabase public.pg_get_functiondef.
-- Use this to author the separate phase-aware search visibility migration.
-- Do not apply this snapshot to another database without reviewing the RLS and development phase behavior.
-- Scope: existing function bodies only. No secrets, keys, or user data.

-- LIVE REFERENCE: public.hybrid_search_events
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
      ee.embedding operator(public.<=>) query_embedding as distance
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
$function$

-- LIVE REFERENCE: public.hybrid_search_listings
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
      le.embedding operator(public.<=>) query_embedding as distance
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
$function$
