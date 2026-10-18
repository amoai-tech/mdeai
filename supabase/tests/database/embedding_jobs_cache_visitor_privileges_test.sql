-- SAN-1523 · Visitors hold no privilege on the embedding queue or the query cache.
-- service_role keeps what the worker needs, and the worker's claim/complete path still works.
-- Run with: supabase test db
begin;

select plan(14);

-- fixture: an unapproved development apartment; the enqueue trigger gives it a pending job to claim
insert into public.apartments (id, title, neighborhood, description, bedrooms, amenities)
values ('00000000-0000-4000-8000-0000000a0099', 'SAN-1523 grants fixture', 'Laureles', 'Fixture for the visitor-privilege test.', 1, array['WiFi']);

-- A. exact privilege set per role and table: none
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
    where has_table_privilege('anon', 'public.embedding_jobs', p)),
  '(none)', 'A1: anon holds no privilege on embedding_jobs');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
    where has_table_privilege('authenticated', 'public.embedding_jobs', p)),
  '(none)', 'A2: authenticated holds no privilege on embedding_jobs');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
    where has_table_privilege('anon', 'public.query_embedding_cache', p)),
  '(none)', 'A3: anon holds no privilege on query_embedding_cache');
select is(
  (select coalesce(string_agg(p, ',' order by p), '(none)')
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
    where has_table_privilege('authenticated', 'public.query_embedding_cache', p)),
  '(none)', 'A4: authenticated holds no privilege on query_embedding_cache');

-- B. the worker's role keeps read and write
select ok(
  (select bool_and(has_table_privilege('service_role', 'public.embedding_jobs', p))
     from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p),
  'B1: service_role can still read and write embedding_jobs');
select ok(
  (select bool_and(has_table_privilege('service_role', 'public.query_embedding_cache', p))
     from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p),
  'B2: service_role can still read and write query_embedding_cache');

-- C. real attempts fail at the privilege layer, before row security is consulted
set local role anon;
select throws_ok($$truncate table public.embedding_jobs$$, '42501', null,
  'C1: anon cannot truncate embedding_jobs');
select throws_ok($$select count(*) from public.embedding_jobs$$, '42501', null,
  'C2: anon cannot even read embedding_jobs');
reset role;

set local role authenticated;
select throws_ok($$truncate table public.query_embedding_cache$$, '42501', null,
  'C3: authenticated cannot truncate query_embedding_cache');
select throws_ok(
  $$insert into public.embedding_jobs (entity_type, entity_id, content_hash, status)
    values ('apartment', '00000000-0000-4000-8000-000000000001', 'x', 'pending')$$,
  '42501', null, 'C4: authenticated cannot queue a job');
reset role;

-- D. the worker path still works end to end
select is(
  (select prosecdef from pg_proc where oid = 'public.enqueue_embedding_job'::regproc),
  true, 'D1: the enqueue trigger function is SECURITY DEFINER, so user edits still queue jobs');

create temp table vec as select array_agg(0.01::float8) as v from generate_series(1, 768);
grant select on vec to public;

set local role service_role;
create temp table claimed as select * from public.claim_embedding_jobs(1);
select is((select count(*)::int from claimed), 1, 'D2: service_role can still claim a job');
select is(
  public.complete_embedding_job((select c.job_id from claimed as c), (select c.lease_token from claimed as c), (select v from vec)),
  'done', 'D3: service_role can still complete a job with a 768-number vector');
reset role;
select is(
  (select status from public.embedding_jobs where id = (select c.job_id from claimed as c)),
  'done', 'D4: the job is recorded as done');

select * from finish();
rollback;
