-- SAN-1305 · Make Rental, Event, and Restaurant Search Work After a Fresh Database Rebuild
--
-- A clean replay must give the same keyword-plus-meaning search contract production has:
-- the three generated full-text columns, their GIN indexes, the three hybrid_search_* functions
-- (SECURITY INVOKER, so the caller's row security applies) and explicit, minimal EXECUTE rights.
--
-- Run with: supabase test db
begin;

select plan(25);

-- A. the generated full-text columns exist and are STORED generated tsvectors -----------------------
select col_type_is('public', 'apartments',  'fts_content', 'tsvector', 'A1: apartments.fts_content is a tsvector');
select col_type_is('public', 'events',      'fts_content', 'tsvector', 'A2: events.fts_content is a tsvector');
select col_type_is('public', 'restaurants', 'fts_content', 'tsvector', 'A3: restaurants.fts_content is a tsvector');
select is((select attgenerated::text from pg_attribute where attrelid = 'public.apartments'::regclass  and attname = 'fts_content'), 's', 'A4: apartments.fts_content is a STORED generated column');
select is((select attgenerated::text from pg_attribute where attrelid = 'public.events'::regclass      and attname = 'fts_content'), 's', 'A5: events.fts_content is a STORED generated column');
select is((select attgenerated::text from pg_attribute where attrelid = 'public.restaurants'::regclass and attname = 'fts_content'), 's', 'A6: restaurants.fts_content is a STORED generated column');

-- B. GIN indexes ----------------------------------------------------------------------------------------
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'apartments'  and indexdef ilike '%using gin (fts_content)%'), 1, 'B1: GIN index on apartments.fts_content');
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'events'      and indexdef ilike '%using gin (fts_content)%'), 1, 'B2: GIN index on events.fts_content');
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'restaurants' and indexdef ilike '%using gin (fts_content)%'), 1, 'B3: GIN index on restaurants.fts_content');

-- C. the three functions exist with production's signature and run as the caller --------------------------
select has_function('public', 'hybrid_search_listings',    array['text','vector','integer','double precision','double precision','integer'], 'C1: hybrid_search_listings exists');
select has_function('public', 'hybrid_search_events',      array['text','vector','integer','double precision','double precision','integer'], 'C2: hybrid_search_events exists');
select has_function('public', 'hybrid_search_restaurants', array['text','vector','integer','double precision','double precision','integer'], 'C3: hybrid_search_restaurants exists');
select is((select prosecdef from pg_proc where oid = 'public.hybrid_search_listings(text,vector,integer,double precision,double precision,integer)'::regprocedure),    false, 'C4: hybrid_search_listings is SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid = 'public.hybrid_search_events(text,vector,integer,double precision,double precision,integer)'::regprocedure),      false, 'C5: hybrid_search_events is SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid = 'public.hybrid_search_restaurants(text,vector,integer,double precision,double precision,integer)'::regprocedure), false, 'C6: hybrid_search_restaurants is SECURITY INVOKER');

-- D. explicit EXECUTE: no implicit PUBLIC grant; the app roles keep theirs --------------------------------
select is((select count(*)::int from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.hybrid_search_listings(text,vector,integer,double precision,double precision,integer)'::regprocedure    and a.grantee = 0), 0, 'D1: PUBLIC cannot execute hybrid_search_listings');
select is((select count(*)::int from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.hybrid_search_events(text,vector,integer,double precision,double precision,integer)'::regprocedure      and a.grantee = 0), 0, 'D2: PUBLIC cannot execute hybrid_search_events');
select is((select count(*)::int from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.hybrid_search_restaurants(text,vector,integer,double precision,double precision,integer)'::regprocedure and a.grantee = 0), 0, 'D3: PUBLIC cannot execute hybrid_search_restaurants');
select ok(
  has_function_privilege('anon',         'public.hybrid_search_listings(text,vector,integer,double precision,double precision,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.hybrid_search_listings(text,vector,integer,double precision,double precision,integer)', 'execute')
  and has_function_privilege('service_role',  'public.hybrid_search_listings(text,vector,integer,double precision,double precision,integer)', 'execute'),
  'D4: anon, authenticated and service_role can execute hybrid_search_listings');
select ok(
  has_function_privilege('anon',         'public.hybrid_search_events(text,vector,integer,double precision,double precision,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.hybrid_search_events(text,vector,integer,double precision,double precision,integer)', 'execute')
  and has_function_privilege('service_role',  'public.hybrid_search_events(text,vector,integer,double precision,double precision,integer)', 'execute'),
  'D5: anon, authenticated and service_role can execute hybrid_search_events');
select ok(
  has_function_privilege('anon',         'public.hybrid_search_restaurants(text,vector,integer,double precision,double precision,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.hybrid_search_restaurants(text,vector,integer,double precision,double precision,integer)', 'execute')
  and has_function_privilege('service_role',  'public.hybrid_search_restaurants(text,vector,integer,double precision,double precision,integer)', 'execute'),
  'D6: anon, authenticated and service_role can execute hybrid_search_restaurants');

-- E. behaviour: a keyword + a meaning leg fuse into one ranked result --------------------------------------
insert into public.apartments (id, title, neighborhood, city, description, status)
values ('00000000-0000-4000-8000-000013050001', 'Zzquiet loft', 'Laureles', 'Medellín', 'Bright and calm.', 'active');
insert into public.listing_embeddings (listing_id, embedding, content_hash)
values ('00000000-0000-4000-8000-000013050001', array_fill(0.01, array[768])::vector, md5('san1305-listing'));

insert into public.events (id, name, event_start_time, description, event_type, is_active)
values ('00000000-0000-4000-8000-000013050002', 'Zzsalsa night', now() + interval '3 days', 'Live salsa band', 'music', true);
-- events_sync_legacy_is_active derives is_active from status on insert, so mark the fixture live explicitly.
update public.events set is_active = true where id = '00000000-0000-4000-8000-000013050002';
insert into public.event_embeddings (event_id, embedding, content_hash)
values ('00000000-0000-4000-8000-000013050002', array_fill(0.01, array[768])::vector, md5('san1305-event'));

insert into public.restaurants (id, name, description, cuisine_types, is_active)
values ('00000000-0000-4000-8000-000013050003', 'Zzquiet cafe', 'Good for remote work', array['cafe'], true);
insert into public.restaurant_embeddings (restaurant_id, embedding, content_hash)
values ('00000000-0000-4000-8000-000013050003', array_fill(0.01, array[768])::vector, md5('san1305-restaurant'));

select ok(exists (select 1 from public.hybrid_search_listings('zzquiet', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050001'),
  'E1: hybrid_search_listings returns the listing found by keyword and by meaning');
select ok(exists (select 1 from public.hybrid_search_events('zzsalsa', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050002'),
  'E2: hybrid_search_events returns the event found by keyword and by meaning');
select ok(exists (select 1 from public.hybrid_search_restaurants('zzquiet', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050003'),
  'E3: hybrid_search_restaurants returns the restaurant found by keyword and by meaning');

-- F. the stored column follows edits, so renamed text is searchable without any manual refresh -------------
update public.apartments set title = 'Zzrenamed loft' where id = '00000000-0000-4000-8000-000013050001';
select is((select count(*)::int from public.apartments where fts_content @@ websearch_to_tsquery('spanish', 'zzrenamed')), 1,
  'F1: an edited title becomes searchable immediately');

select * from finish();
rollback;
