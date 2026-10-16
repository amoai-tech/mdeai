-- SAN-1305 · Make Rental, Event, and Restaurant Search Work After a Fresh Database Rebuild
--
-- A clean replay must give the same keyword-plus-meaning search contract production has:
-- the three generated full-text columns, their GIN indexes, the vector (HNSW) indexes, the three
-- hybrid_search_* functions (SECURITY INVOKER, so the caller's row security applies) and explicit,
-- minimal EXECUTE rights. It also proves each search leg on its own and the caller's row security.
--
-- Run with: supabase test db
begin;

select plan(36);

-- A. the generated full-text columns exist and are STORED generated tsvectors -----------------------
select col_type_is('public', 'apartments',  'fts_content', 'tsvector', 'A1: apartments.fts_content is a tsvector');
select col_type_is('public', 'events',      'fts_content', 'tsvector', 'A2: events.fts_content is a tsvector');
select col_type_is('public', 'restaurants', 'fts_content', 'tsvector', 'A3: restaurants.fts_content is a tsvector');
select is((select attgenerated::text from pg_attribute where attrelid = 'public.apartments'::regclass  and attname = 'fts_content'), 's', 'A4: apartments.fts_content is a STORED generated column');
select is((select attgenerated::text from pg_attribute where attrelid = 'public.events'::regclass      and attname = 'fts_content'), 's', 'A5: events.fts_content is a STORED generated column');
select is((select attgenerated::text from pg_attribute where attrelid = 'public.restaurants'::regclass and attname = 'fts_content'), 's', 'A6: restaurants.fts_content is a STORED generated column');

-- B. indexes: GIN for keywords, HNSW for meaning ----------------------------------------------------------
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'apartments'  and indexdef ilike '%using gin (fts_content)%'), 1, 'B1: GIN index on apartments.fts_content');
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'events'      and indexdef ilike '%using gin (fts_content)%'), 1, 'B2: GIN index on events.fts_content');
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'restaurants' and indexdef ilike '%using gin (fts_content)%'), 1, 'B3: GIN index on restaurants.fts_content');
select is((select count(*)::int from pg_indexes where schemaname = 'public'
            and indexname in ('listing_embeddings_hnsw', 'event_embeddings_hnsw', 'restaurant_embeddings_hnsw')
            and indexdef ilike '%using hnsw (embedding vector_cosine_ops)%'), 3, 'B4: the three HNSW cosine indexes exist');

-- C. the three functions exist with production's signature and run as the caller --------------------------
select has_function('public', 'hybrid_search_listings',    array['text','vector','integer','double precision','double precision','integer'], 'C1: hybrid_search_listings exists');
select has_function('public', 'hybrid_search_events',      array['text','vector','integer','double precision','double precision','integer'], 'C2: hybrid_search_events exists');
select has_function('public', 'hybrid_search_restaurants', array['text','vector','integer','double precision','double precision','integer'], 'C3: hybrid_search_restaurants exists');
select is((select prosecdef from pg_proc where oid = 'public.hybrid_search_listings(text,vector,integer,double precision,double precision,integer)'::regprocedure),    false, 'C4: hybrid_search_listings is SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid = 'public.hybrid_search_events(text,vector,integer,double precision,double precision,integer)'::regprocedure),      false, 'C5: hybrid_search_events is SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid = 'public.hybrid_search_restaurants(text,vector,integer,double precision,double precision,integer)'::regprocedure), false, 'C6: hybrid_search_restaurants is SECURITY INVOKER');

-- D. explicit EXECUTE: no implicit PUBLIC grant; the app roles keep theirs; the tables stay readable -------
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
select ok(
  (select bool_and(has_table_privilege(r, t, 'SELECT'))
     from unnest(array['anon','authenticated']) r,
          unnest(array['public.apartments','public.events','public.restaurants',
                       'public.listing_embeddings','public.event_embeddings','public.restaurant_embeddings']) t),
  'D7: anon and authenticated can read the six tables the search functions read');

-- Fixtures (inserted as the owner, before any role switch) --------------------------------------------------
-- listing A: found by keyword AND by meaning
insert into public.apartments (id, title, neighborhood, city, description, status)
values ('00000000-0000-4000-8000-000013050001', 'Zzquiet loft', 'Laureles', 'Medellín', 'Bright and calm.', 'active');
insert into public.listing_embeddings (listing_id, embedding, content_hash)
values ('00000000-0000-4000-8000-000013050001', array_fill(0.01, array[768])::vector, md5('san1305-listing-a'));
-- listing B: keyword only (no stored meaning vector)
insert into public.apartments (id, title, neighborhood, city, description, status)
values ('00000000-0000-4000-8000-000013050004', 'Zzkeyword villa', 'Poblado', 'Medellín', 'Large terrace.', 'active');
-- listing C: meaning only (its text never contains the query word)
insert into public.apartments (id, title, neighborhood, city, description, status)
values ('00000000-0000-4000-8000-000013050006', 'Plain house', 'Envigado', 'Medellín', 'Ordinary home.', 'active');
insert into public.listing_embeddings (listing_id, embedding, content_hash)
values ('00000000-0000-4000-8000-000013050006', array_fill(0.01, array[768])::vector, md5('san1305-listing-c'));
-- listing D: explicitly private, so row security must hide it from visitors
insert into public.apartments (id, title, neighborhood, city, description, status, metadata)
values ('00000000-0000-4000-8000-000013050005', 'Zzprivate loft', 'Laureles', 'Medellín', 'Not for the public.', 'active', '{"visibility":"private"}'::jsonb);

-- the event goes live through its real lifecycle: status 'published' makes the trigger set is_active
insert into public.events (id, name, event_start_time, description, event_type, status)
values ('00000000-0000-4000-8000-000013050002', 'Zzsalsa night', now() + interval '3 days', 'Live salsa band', 'music', 'published');
insert into public.event_embeddings (event_id, embedding, content_hash)
values ('00000000-0000-4000-8000-000013050002', array_fill(0.01, array[768])::vector, md5('san1305-event'));

insert into public.restaurants (id, name, description, cuisine_types, is_active)
values ('00000000-0000-4000-8000-000013050003', 'Zzquiet cafe', 'Good for remote work', array['cafe'], true);
insert into public.restaurant_embeddings (restaurant_id, embedding, content_hash)
values ('00000000-0000-4000-8000-000013050003', array_fill(0.01, array[768])::vector, md5('san1305-restaurant'));

-- E. behaviour: each leg works on its own, and together they fuse into one ranked result ----------------------
select is((select is_active from public.events where id = '00000000-0000-4000-8000-000013050002'), true,
  'E0: publishing the event made it active through the lifecycle trigger');
select ok(exists (select 1 from public.hybrid_search_listings('zzquiet', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050001'),
  'E1: a listing found by keyword and by meaning is returned');
select ok(exists (select 1 from public.hybrid_search_listings('zzkeyword', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050004'),
  'E2: a keyword-only listing (no stored vector) is returned by the keyword leg');
select ok(exists (select 1 from public.hybrid_search_listings('zznomatchterm', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050006'),
  'E3: a meaning-only listing (text never matches the query) is returned by the vector leg');
select ok(exists (select 1 from public.hybrid_search_events('zzsalsa', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050002'),
  'E4: hybrid_search_events returns the event found by keyword and by meaning');
select ok(exists (select 1 from public.hybrid_search_restaurants('zzquiet', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050003'),
  'E5: hybrid_search_restaurants returns the restaurant found by keyword and by meaning');

-- R. the caller's row security applies, because the functions run as the caller ---------------------------------
set local role anon;
select lives_ok($$select count(*) from public.hybrid_search_listings('zzquiet', array_fill(0.01, array[768])::vector, 5)$$,
  'R1: anon can call hybrid_search_listings');
select ok(exists (select 1 from public.hybrid_search_listings('zzkeyword', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050004'),
  'R2: anon finds an ordinary active listing by keyword');
select ok(not exists (select 1 from public.hybrid_search_listings('zzprivate', array_fill(0.01, array[768])::vector, 5)
                       where id = '00000000-0000-4000-8000-000013050005'),
  'R3: anon cannot find a private listing, even by its exact keyword');
select ok(exists (select 1 from public.hybrid_search_events('zzsalsa', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050002'),
  'R4: anon finds a published event');
reset role;

set local role authenticated;
select lives_ok($$select count(*) from public.hybrid_search_events('zzsalsa', array_fill(0.01, array[768])::vector, 5)$$,
  'R5: a signed-in user can call hybrid_search_events');
reset role;

-- the private listing really is searchable by its owner role, so R3 proves row security and not missing data
select ok(exists (select 1 from public.hybrid_search_listings('zzprivate', array_fill(0.01, array[768])::vector, 5)
                   where id = '00000000-0000-4000-8000-000013050005'),
  'R6: the same private listing is found when row security does not hide it');

-- F. the stored column follows edits, so renamed text is searchable without any manual refresh -------------
update public.apartments set title = 'Zzrenamed loft' where id = '00000000-0000-4000-8000-000013050001';
select is((select count(*)::int from public.apartments where fts_content @@ websearch_to_tsquery('spanish', 'zzrenamed')), 1,
  'F1: an edited title becomes searchable immediately');

select * from finish();
rollback;
