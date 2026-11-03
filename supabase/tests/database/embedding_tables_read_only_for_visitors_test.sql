-- SAN-1523 · Visitors can read the search-fingerprint tables and nothing else.
-- service_role keeps write access (the embedding worker writes as service_role).
-- Run with: supabase test db
begin;

select plan(14);

-- A. exact privilege set per role and table: SELECT only
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege('anon', 'public.listing_embeddings', p)),
  'SELECT', 'A1: anon holds only SELECT on listing_embeddings');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege('authenticated', 'public.listing_embeddings', p)),
  'SELECT', 'A2: authenticated holds only SELECT on listing_embeddings');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege('anon', 'public.event_embeddings', p)),
  'SELECT', 'A3: anon holds only SELECT on event_embeddings');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege('authenticated', 'public.event_embeddings', p)),
  'SELECT', 'A4: authenticated holds only SELECT on event_embeddings');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege('anon', 'public.restaurant_embeddings', p)),
  'SELECT', 'A5: anon holds only SELECT on restaurant_embeddings');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege('authenticated', 'public.restaurant_embeddings', p)),
  'SELECT', 'A6: authenticated holds only SELECT on restaurant_embeddings');

-- B. the worker's role is untouched
select ok(
  has_table_privilege('service_role', 'public.listing_embeddings', 'INSERT')
    and has_table_privilege('service_role', 'public.listing_embeddings', 'UPDATE')
    and has_table_privilege('service_role', 'public.listing_embeddings', 'DELETE'),
  'B1: service_role can still write listing_embeddings');
select ok(
  has_table_privilege('service_role', 'public.event_embeddings', 'INSERT')
    and has_table_privilege('service_role', 'public.event_embeddings', 'UPDATE')
    and has_table_privilege('service_role', 'public.event_embeddings', 'DELETE'),
  'B2: service_role can still write event_embeddings');
select ok(
  has_table_privilege('service_role', 'public.restaurant_embeddings', 'INSERT')
    and has_table_privilege('service_role', 'public.restaurant_embeddings', 'UPDATE')
    and has_table_privilege('service_role', 'public.restaurant_embeddings', 'DELETE'),
  'B3: service_role can still write restaurant_embeddings');

-- C. real attempts fail at the privilege layer, before row security is consulted
set local role anon;
select throws_ok($$truncate table public.listing_embeddings$$, '42501', null,
  'C1: anon cannot truncate listing_embeddings');
select throws_ok(
  $$insert into public.event_embeddings (event_id, embedding, content_hash)
    values ('00000000-0000-4000-8000-000000000001', array_fill(0.0, array[768])::vector, 'x')$$,
  '42501', null, 'C2: anon cannot insert into event_embeddings');
reset role;

set local role authenticated;
select throws_ok($$truncate table public.restaurant_embeddings$$, '42501', null,
  'C3: authenticated cannot truncate restaurant_embeddings');
select throws_ok(
  $$update public.listing_embeddings set content_hash = 'x'$$,
  '42501', null, 'C4: authenticated cannot update listing_embeddings');
reset role;

-- D. reads still work for both roles
set local role anon;
select lives_ok($$select count(*) from public.listing_embeddings$$, 'D1: anon can still read the fingerprints');
reset role;

select * from finish();
rollback;
