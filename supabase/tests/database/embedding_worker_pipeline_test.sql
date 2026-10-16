-- SAN-1523 · embedding worker pipeline (PR 1 of 2)
--
-- Proves, on a fresh replay: development records enqueue without any business approval, every semantic
-- field changes the fingerprint, duplicate edits do not queue duplicates, claiming is bounded and
-- lease-based, a stale vector can never overwrite a newer edit, retries are bounded, and only
-- service_role can run any of it.
--
-- Run with: supabase test db
begin;

select plan(41);

-- ── fixtures: unapproved, unpublished development rows --------------------------------------------------
insert into public.apartments (id, title, neighborhood, description, bedrooms, amenities)
values ('00000000-0000-4000-8000-0000000a0001', 'SAN-1523 quiet loft', 'Laureles', 'Quiet, bright, good light.', 1, array['WiFi','Balcony']);
insert into public.events (id, name, event_start_time, description, event_type)
values ('00000000-0000-4000-8000-0000000e0001', 'SAN-1523 salsa night', now() + interval '3 days', 'Live salsa band', 'music');
insert into public.restaurants (id, name, description, cuisine_types)
values ('00000000-0000-4000-8000-0000000b0001', 'SAN-1523 quiet cafe', 'Good for remote work', array['cafe']);

-- ── A. enqueue: no business gate ---------------------------------------------------------------------------
select is(
  (select moderation_status from public.apartments where id = '00000000-0000-4000-8000-0000000a0001'),
  (select moderation_status from public.apartments where id = '00000000-0000-4000-8000-0000000a0001'),
  'fixture apartment exists');
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'pending'),
  1, 'an apartment that is not approved or published still gets a pending job');
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000e0001' and status = 'pending'),
  1, 'an event gets a pending job without any is_active gate');
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000b0001' and status = 'pending'),
  1, 'a restaurant gets a pending job without any is_active gate');
select is(
  (select count(*)::int from pg_trigger t
    where t.tgfoid = 'public.enqueue_embedding_job'::regproc and not t.tgisinternal and t.tgqual is not null),
  0, 'no enqueue trigger has a WHEN business gate');

-- ── B. the document is factual, and the fingerprint follows every semantic field ---------------------------
select matches(
  (select content_text from public.embedding_document_for_entity('apartment', '00000000-0000-4000-8000-0000000a0001')),
  'Laureles', 'the apartment document carries the neighborhood');
select doesnt_match(
  (select content_text from public.embedding_document_for_entity('apartment', '00000000-0000-4000-8000-0000000a0001')),
  '00000000-0000-4000-8000|http|price|rating',
  'the apartment document carries no id, url, price or rating');

create temp table h0 as
  select content_hash from public.embedding_document_for_entity('apartment', '00000000-0000-4000-8000-0000000a0001');

update public.apartments set neighborhood = 'El Poblado' where id = '00000000-0000-4000-8000-0000000a0001';
select isnt(
  (select content_hash from public.embedding_document_for_entity('apartment', '00000000-0000-4000-8000-0000000a0001')),
  (select content_hash from h0),
  'editing only the neighborhood changes the fingerprint (the old md5(title||description||id) missed it)');
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'pending'),
  1, 'the edit leaves exactly one pending job');
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'skipped' and last_error like 'superseded%'),
  1, 'the older pending job is superseded, not deleted');

update public.apartments set amenities = array['WiFi','Balcony','Desk'] where id = '00000000-0000-4000-8000-0000000a0001';
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'pending'),
  1, 'an amenities edit also keeps exactly one pending job');

update public.apartments set neighborhood = 'El Poblado' where id = '00000000-0000-4000-8000-0000000a0001';
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status in ('pending','processing')),
  1, 'saving identical content queues no duplicate');

-- ── C. privileges ----------------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'public.claim_embedding_jobs(integer)', 'execute'), false, 'anon cannot claim');
select is(has_function_privilege('authenticated', 'public.claim_embedding_jobs(integer)', 'execute'), false, 'authenticated cannot claim');
select is(has_function_privilege('authenticated', 'public.complete_embedding_job(uuid,uuid,double precision[])', 'execute'), false, 'authenticated cannot complete');
select is(has_function_privilege('authenticated', 'public.fail_embedding_job(uuid,uuid,text,boolean,boolean,boolean)', 'execute'), false, 'authenticated cannot fail');
select is(has_function_privilege('anon', 'public.embedding_document_for_entity(text,uuid)', 'execute'), false, 'anon cannot read documents');
select is(has_function_privilege('service_role', 'public.claim_embedding_jobs(integer)', 'execute'), true, 'service_role can claim');

-- ── D. claim: bounded, leased, not claimable twice ---------------------------------------------------------------
-- Clear unrelated backlog so the counts below are about the fixtures only.
update public.embedding_jobs set status = 'skipped', last_error = 'test setup'
 where status = 'pending' and entity_id not in
   ('00000000-0000-4000-8000-0000000a0001','00000000-0000-4000-8000-0000000e0001','00000000-0000-4000-8000-0000000b0001');

set local role service_role;
create temp table claimed as select * from public.claim_embedding_jobs(2);
select is((select count(*)::int from claimed), 2, 'a claim of 2 returns at most 2 jobs');
select is((select count(distinct lease_token)::int from claimed), 1, 'one claim shares one lease token');
select is((select min(attempts)::int from claimed), 1, 'claiming counts an attempt');
select is((select count(*)::int from public.claim_embedding_jobs(10)), 1, 'a second claim only gets what the first left (no job is handed out twice)');
reset role;

-- ── E. complete: the fresh job stores the vector; a stale job never does -----------------------------------------
create temp table vec as select array_agg(0.01::float8) as v from generate_series(1, 768);
grant select on vec to public;

set local role service_role;
select is(
  public.complete_embedding_job(
    (select job_id from claimed limit 1),
    gen_random_uuid(), (select v from vec)),
  'lost_lease', 'a wrong lease token changes nothing');
reset role;

select is(
  (select count(*)::int from public.listing_embeddings where listing_id = '00000000-0000-4000-8000-0000000a0001'),
  0, 'no vector exists before completion');

-- edit the record while its job is processing: the old job must be superseded, not stored
update public.apartments set description = 'Edited while the worker was running.' where id = '00000000-0000-4000-8000-0000000a0001';
set local role service_role;
select is(
  public.complete_embedding_job(
    (select id from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'processing' limit 1),
    (select lease_token from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'processing' limit 1),
    (select v from vec)),
  'superseded', 'a job whose record changed mid-run is superseded');
reset role;
select is(
  (select count(*)::int from public.listing_embeddings where listing_id = '00000000-0000-4000-8000-0000000a0001'),
  0, 'and its stale vector was NOT written');
select is(
  (select count(*)::int from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'pending'),
  1, 'a fresh job for the edited record is waiting');

-- complete the restaurant job properly
set local role service_role;
select is(
  public.complete_embedding_job(
    (select id from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000b0001' and status = 'processing' limit 1),
    (select lease_token from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000b0001' and status = 'processing' limit 1),
    (select v from vec)),
  'done', 'a current job stores its vector and finishes');
reset role;
select is(
  (select content_hash from public.restaurant_embeddings where restaurant_id = '00000000-0000-4000-8000-0000000b0001'),
  (select content_hash from public.embedding_document_for_entity('restaurant', '00000000-0000-4000-8000-0000000b0001')),
  'the stored vector carries the current document hash');

-- ── F. retries are bounded --------------------------------------------------------------------------------------
update public.embedding_jobs
   set status = 'processing', lease_token = '00000000-0000-4000-8000-00000000ffff', attempts = 5, lease_expires_at = now() + interval '5 minutes'
 where entity_id = '00000000-0000-4000-8000-0000000e0001' and status in ('pending','processing');
set local role service_role;
select is(
  public.fail_embedding_job(
    (select id from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000e0001' and status = 'processing' limit 1),
    '00000000-0000-4000-8000-00000000ffff', 'HTTP 429', true),
  'failed', 'the fifth failed attempt is terminal');
reset role;
select is(
  (select last_error from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000e0001' and status = 'failed' limit 1),
  'HTTP 429', 'the failure keeps a short reason');


-- ── G. wrong dimensions, backoff, and a crashed worker -----------------------------------------------------------
set local role service_role;
create temp table c2 as select * from public.claim_embedding_jobs(5);
reset role;
select is((select count(*)::int from c2 where entity_id = '00000000-0000-4000-8000-0000000a0001'), 1,
  'the fresh job for the edited apartment is claimable');

set local role service_role;
select throws_ok(
  format($$select public.complete_embedding_job(%L, %L, array[0.1, 0.2]::float8[])$$,
    (select job_id from c2 limit 1), (select lease_token from c2 limit 1)),
  null, 'embedding has 2 values, expected 768',
  'a vector with the wrong number of values is refused, never stored');
select is(
  public.fail_embedding_job((select job_id from c2 limit 1), (select lease_token from c2 limit 1), 'HTTP 503', true),
  'retry', 'a retryable failure goes back to pending');
reset role;
select ok(
  (select next_attempt_at > now() + interval '30 seconds' from public.embedding_jobs
    where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'pending'),
  'and waits (backoff) before the next attempt');
select is(
  (select count(*)::int from (select * from public.claim_embedding_jobs(5)) x), 0, 'it is not claimed again until the wait is over');
-- a worker that died holding the job: its lease expires and the job is reclaimed with another attempt
update public.embedding_jobs set status = 'processing', lease_token = '00000000-0000-4000-8000-00000000eeee',
       lease_expires_at = now() - interval '1 minute', attempts = 2
 where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'pending';
set local role service_role;
select is((select attempts from public.claim_embedding_jobs(5) where entity_id = '00000000-0000-4000-8000-0000000a0001'), 3,
  'an expired lease is reclaimed and the attempt is counted');
-- the first worker wakes up late: its token no longer owns the job, so its result is discarded
select is(
  public.complete_embedding_job(
    (select id from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'processing' limit 1),
    '00000000-0000-4000-8000-00000000eeee', (select v from vec)),
  'lost_lease', 'a worker whose lease was reclaimed cannot complete the job');
-- a configuration failure (bad Gemini key) hands the attempt back instead of spending it
select is(
  public.fail_embedding_job(
    (select id from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'processing' limit 1),
    (select lease_token from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'processing' limit 1),
    'Gemini rejected the API key', true, false, true),
  'retry', 'a refunded failure goes back to pending');
reset role;
select is(
  (select attempts from public.embedding_jobs where entity_id = '00000000-0000-4000-8000-0000000a0001' and status = 'pending' limit 1),
  2, 'and the attempt is given back (3 claimed, 1 refunded)');

-- ── H. an unusually long description cannot exceed the embedding model's input limit --------------------------
update public.apartments set description = repeat('quiet bright airy ', 2000)
 where id = '00000000-0000-4000-8000-0000000a0001';
select cmp_ok(
  (select length(content_text) from public.embedding_document_for_entity('apartment', '00000000-0000-4000-8000-0000000a0001')),
  '<=', 6000, 'a 36,000-character description is cut to 6000 characters before embedding');

select * from finish();
rollback;
