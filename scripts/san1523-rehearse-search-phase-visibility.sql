-- SAN-1523 · rehearsal for 20261016232000_search_development_visibility.sql
--
-- WHY A REHEARSAL, NOT pgTAP: hybrid_search_listings/events depend on the live-only generated column
-- fts_content, so a fresh replay (supabase test db) never creates them. This script gives a scratch
-- database the same shape inside one transaction, applies the migration, and proves both phases.
--
-- Run (LOCAL scratch database only; everything is rolled back):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f scripts/san1523-rehearse-search-phase-visibility.sql
begin;
set local client_min_messages = notice;

-- the live-only column, approximated (production's own definition is untouched by the migration)
alter table public.apartments add column if not exists fts_content tsvector
  generated always as (to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
alter table public.events add column if not exists fts_content tsvector
  generated always as (to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(description, ''))) stored;

-- production keeps the vector extension in schema public (the live functions say operator(public.<=>));
-- a local replay keeps it in schema extensions, so give the scratch transaction the same operator name
do $shim$
begin
  if not exists (select 1 from pg_operator o join pg_namespace n on n.oid = o.oprnamespace
                  where n.nspname = 'public' and o.oprname = '<=>') then
    create operator public.<=> (leftarg = extensions.vector, rightarg = extensions.vector,
                                function = extensions.cosine_distance);
  end if;
end
$shim$;

\i supabase/migrations/20261016232000_search_development_visibility.sql

-- fixtures go in with row triggers bypassed: existing triggers on events/apartments rewrite some columns
-- (for example is_active), and this rehearsal needs the exact states below
set local session_replication_role = replica;
insert into public.apartments (id, title, neighborhood, description, bedrooms, status)
values ('00000000-0000-4000-8000-00000051a001', 'RH inactive dev loft', 'Laureles', 'rehearsalmarker quiet loft', 1, 'inactive'),
       ('00000000-0000-4000-8000-00000051a002', 'RH active loft',       'Laureles', 'rehearsalmarker bright flat', 1, 'active');
insert into public.events (id, name, event_start_time, description, event_type, is_active)
values ('00000000-0000-4000-8000-00000051e001', 'RH inactive dev party', now() + interval '2 days', 'rehearsalmarker salsa', 'music', false),
       ('00000000-0000-4000-8000-00000051e002', 'RH active party',       now() + interval '2 days', 'rehearsalmarker rooftop', 'music', true),
       ('00000000-0000-4000-8000-00000051e003', 'RH past inactive party', now() - interval '3 days', 'rehearsalmarker old', 'music', false);

-- identical vectors so the vector path matches both rows; the keyword path matches on the marker
insert into public.listing_embeddings (listing_id, embedding, model, content_hash)
select id, array_fill(0.01::float8, array[768])::vector, 'gemini-embedding-001', 'rh'
  from public.apartments where id::text like '00000000-0000-4000-8000-00000051a%';
insert into public.event_embeddings (event_id, embedding, model, content_hash)
select id, array_fill(0.01::float8, array[768])::vector, 'gemini-embedding-001', 'rh'
  from public.events where id::text like '00000000-0000-4000-8000-00000051e%';

set local session_replication_role = origin;

create temp table q as select array_fill(0.01::float8, array[768])::vector as v;

do $t$
declare
  ids uuid[];
  inactive_apt  constant uuid := '00000000-0000-4000-8000-00000051a001';
  active_apt    constant uuid := '00000000-0000-4000-8000-00000051a002';
  inactive_evt  constant uuid := '00000000-0000-4000-8000-00000051e001';
  active_evt    constant uuid := '00000000-0000-4000-8000-00000051e002';
  past_evt      constant uuid := '00000000-0000-4000-8000-00000051e003';
  keyword_only  text := 'rehearsalmarker';
  v vector := (select v from q);
begin
  assert (select is_active from public.events where id = active_evt) and not (select is_active from public.events where id = inactive_evt), 'fixture states are as intended';
  -- DEVELOPMENT: the inactive records are found, by keyword and by vector alone
  select array_agg(id) into ids from public.hybrid_search_listings(keyword_only, v, 20);
  assert inactive_apt = any(ids) and active_apt = any(ids), 'dev: listings keyword+vector include inactive';
  select array_agg(id) into ids from public.hybrid_search_listings('zzznomatch', v, 20);
  assert inactive_apt = any(ids), 'dev: listings found by vector alone';
  select array_agg(id) into ids from public.hybrid_search_events(keyword_only, v, 20);
  assert inactive_evt = any(ids) and active_evt = any(ids), 'dev: events keyword+vector include inactive';
  select array_agg(id) into ids from public.hybrid_search_events('zzznomatch', v, 20);
  assert inactive_evt = any(ids), 'dev: events found by vector alone';
  assert not (past_evt = any(ids)), 'dev: a past event is still not a result (time window kept)';
  raise notice 'ok - development: inactive apartments and events are searchable (keyword and vector); past events still excluded';

  -- LAUNCH: exactly the old behaviour
  update public.rental_runtime_settings set phase = 'launch' where singleton;
  update public.app_runtime_config set value = 'launch' where key = 'application_phase';
  select array_agg(id) into ids from public.hybrid_search_listings(keyword_only, v, 20);
  assert active_apt = any(ids) and not (inactive_apt = any(ids)), 'launch: only active listings';
  select array_agg(id) into ids from public.hybrid_search_listings('zzznomatch', v, 20);
  assert not (inactive_apt = any(ids)), 'launch: inactive listing not found by vector either';
  select array_agg(id) into ids from public.hybrid_search_events(keyword_only, v, 20);
  assert active_evt = any(ids) and not (inactive_evt = any(ids)), 'launch: only active events';
  select array_agg(id) into ids from public.hybrid_search_events('zzznomatch', v, 20);
  assert not (inactive_evt = any(ids)), 'launch: inactive event not found by vector either';
  raise notice 'ok - launch: only active apartments and events (old behaviour unchanged)';
end
$t$;

-- Result shapes must equal the live signatures (15 listing columns, 11 event columns). CREATE OR REPLACE keeps
-- the existing EXECUTE grants; production lets anon call both functions on purpose (public search uses the
-- anonymous client), so no grant is changed or asserted here.
do $shape$
begin
  assert (select count(*) from information_schema.parameters
           where specific_schema = 'public' and parameter_mode = 'OUT'
             and specific_name like 'hybrid_search_listings%') = 15, 'hybrid_search_listings returns 15 columns';
  assert (select count(*) from information_schema.parameters
           where specific_schema = 'public' and parameter_mode = 'OUT'
             and specific_name like 'hybrid_search_events%') = 11, 'hybrid_search_events returns 11 columns';
  raise notice 'ok - result shapes unchanged: 15 listing columns, 11 event columns';
end
$shape$;

rollback;
