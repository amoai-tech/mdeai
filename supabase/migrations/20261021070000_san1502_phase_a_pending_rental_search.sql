-- SAN-1502: Phase A normal development listings, including pending/inactive,
-- must be discoverable. Preserve RLS, private/fixture isolation and launch rules.
-- Supersedes active-only search from SAN-1305; do not create a parallel engine.
create or replace function public.rental_listing_is_public(
  p_status text, p_moderation_status text, p_listing_workflow_status text,
  p_landlord_id uuid, p_metadata jsonb)
returns boolean language sql stable security invoker set search_path = ''
as $policy$
  select coalesce(lower(p_metadata->>'visibility'),'') not in ('private','internal')
    and case when public.rental_development_active() then
      coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
      and coalesce(lower(p_metadata->>'inventory_kind'),'') <> 'test_fixture'
    else
      p_status='active' and p_moderation_status='approved'
      and p_listing_workflow_status='published' and p_landlord_id is not null
      and coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
      and coalesce(lower(p_metadata->>'inventory_kind'),'') not in ('test_fixture','external_candidate')
      and coalesce(lower(p_metadata->>'inventory_type'),'') <> 'external'
      and coalesce(lower(p_metadata->>'allowed_action'),'') <> 'view_original_listing'
    end;
$policy$;

-- Viewing requestability is unchanged here: the canonical atomic RPC still
-- needs its own independent security and idempotency proof.

-- Keep the original SECURITY INVOKER hybrid RPC and matching RRF weights.
-- Remove the duplicate status check from BOTH FTS and vector candidates.
-- The existing RLS policy is the sole row-visibility authority.
do $do$
declare
  v_vector_schema text := (select n.nspname from pg_extension e
    join pg_namespace n on n.oid=e.extnamespace where e.extname='vector');
begin
  if v_vector_schema is null then raise exception 'pgvector is required'; end if;
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
    where a.fts_content @@ websearch_to_tsquery('spanish', query_text)
  ),
  sem_raw as (
    select
      le.listing_id as id,
      le.embedding operator(%1$I.<=>) query_embedding as distance
    from public.listing_embeddings le
    inner join public.apartments a on a.id = le.listing_id
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
end
$do$;
