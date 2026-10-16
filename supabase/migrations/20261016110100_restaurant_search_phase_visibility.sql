-- SAN-1521 · Restaurant search RPCs honour the development phase
--
-- hybrid_search_restaurants() is the live AI search path. It and semantic_search_restaurants()
-- existed only in the database, and both depended on the live-only generated column
-- public.restaurants.fts_content. They are recovered phase-aware ONLY where that column
-- exists (production), so a fresh rebuild without the live-only FTS helpers is unaffected.
set search_path = public, extensions;

do $g1$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='restaurants' and column_name='fts_content') then
    execute $ddl$
create or replace function public.hybrid_search_restaurants(
  query_text text, query_embedding vector, match_count integer default 10,
  fts_weight double precision default 1.5, semantic_weight double precision default 1.0,
  rrf_k integer default 60
) returns table(id uuid, name text, description text, cuisine_types text[], address text, city text, price_level integer, rating numeric, primary_image_url text, dietary_options text[], ambiance text[], similarity double precision)
language sql stable set search_path = public, extensions
as $fn$
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
$fn$;
    $ddl$;
  end if;
end
$g1$;

do $g2$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='restaurants' and column_name='fts_content') then
    execute $ddl$
create or replace function public.semantic_search_restaurants(
  query_embedding vector, similarity_threshold double precision default 0.6, match_count integer default 20
) returns table(id uuid, name text, description text, cuisine_types text[], address text, city text, price_level integer, rating numeric, primary_image_url text, dietary_options text[], ambiance text[], similarity double precision)
language sql stable set search_path = public, extensions
as $fn$
  select r.id, r.name, r.description, r.cuisine_types, r.address, r.city,
    r.price_level, r.rating, r.primary_image_url, r.dietary_options, r.ambiance,
    (1 - (re.embedding <=> query_embedding))::float8 as similarity
  from public.restaurants r
  inner join public.restaurant_embeddings re on re.restaurant_id = r.id
  where (r.is_active = true or private.mde_application_phase() = 'development')
    and (1 - (re.embedding <=> query_embedding)) > similarity_threshold
  order by re.embedding <=> query_embedding limit match_count;
$fn$;
    $ddl$;
  end if;
end
$g2$;
