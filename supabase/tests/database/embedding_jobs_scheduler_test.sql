-- SAN-1523 (PR 2) — the embedding worker is scheduled, and the schedule behaves
--
-- WHAT THIS LOCKS IN
--   A. The job exists, runs every minute, is active, and runs as postgres.
--   B. It carries no literal Supabase URL and reads project_url + embedding_cron_secret from Vault.
--   C. It RUNS (the stored command is executed, not just inspected):
--        - empty queue                      -> no HTTP request queued
--        - only done / skipped jobs         -> no HTTP request queued
--        - a pending job due in the future  -> no HTTP request queued (backoff is respected)
--        - a due pending job, no secret     -> raises P1523 (fails loudly, never silently)
--        - a due pending job, secrets set   -> exactly one request to the worker URL, with the secret header
--        - a processing job, lease expired  -> a request is queued (crashed worker is retried)
--
-- The secret used here is a test value created inside this transaction and rolled back.
--
-- RED -> GREEN
--   RED   before 20261018130000: the job does not exist, so A-C fail.
--   GREEN after it.
--
-- Run with: supabase test db

begin;

select plan(12);

-- ═══ A · The job ═══════════════════════════════════════════════════════════════
select is(
  (select schedule from cron.job where jobname = 'mdeai_embedding_jobs_tick'),
  '* * * * *',
  'SAN-1523: mdeai_embedding_jobs_tick runs every minute');

select ok(
  (select active from cron.job where jobname = 'mdeai_embedding_jobs_tick'),
  'SAN-1523: the embedding job is active');

select is(
  (select count(*)::int from cron.job
    where jobname = 'mdeai_embedding_jobs_tick' and database = 'postgres' and username = 'postgres'),
  1,
  'SAN-1523: the embedding job runs as postgres on the postgres database');

-- ═══ B · Environment safety ════════════════════════════════════════════════════
select ok(
  (select command !~* 'https?://[a-z0-9-]+\.supabase\.(co|in)'
     from cron.job where jobname = 'mdeai_embedding_jobs_tick'),
  'SAN-1523: the command contains NO literal Supabase URL');

select ok(
  (select command like '%project_url%' and command like '%embedding_cron_secret%'
          and command like '%/functions/v1/process-embedding-jobs%'
     from cron.job where jobname = 'mdeai_embedding_jobs_tick'),
  'SAN-1523: the command resolves project_url and embedding_cron_secret from Vault and targets the worker');

-- ═══ C · The command actually runs ═════════════════════════════════════════════
create temp table _cmd as
  select command from cron.job where jobname = 'mdeai_embedding_jobs_tick';

delete from public.embedding_jobs;

create temp table _n (label text primary key, n bigint);

-- run the stored command exactly as pg_cron would
create function pg_temp.run_tick() returns void language plpgsql as $f$
begin
  execute (select command from _cmd);
end
$f$;

insert into _n values ('start', (select count(*) from net.http_request_queue));

-- C1 · empty queue
select lives_ok($$ select pg_temp.run_tick() $$, 'SAN-1523: empty queue runs cleanly');
select is(
  (select count(*) from net.http_request_queue) - (select n from _n where label = 'start'),
  0::bigint,
  'SAN-1523: an empty queue queues NO HTTP request');

-- C2 · only finished work, and work that is not due yet
insert into public.embedding_jobs (entity_type, entity_id, content_hash, status, next_attempt_at)
values ('apartment', gen_random_uuid(), 'done-1', 'done', now()),
       ('apartment', gen_random_uuid(), 'skip-1', 'skipped', now()),
       ('apartment', gen_random_uuid(), 'later-1', 'pending', now() + interval '1 hour');
select pg_temp.run_tick();
select is(
  (select count(*) from net.http_request_queue) - (select n from _n where label = 'start'),
  0::bigint,
  'SAN-1523: done, skipped and not-yet-due jobs queue NO HTTP request');

-- C3 · due work but no secret provisioned -> loud failure
insert into public.embedding_jobs (entity_type, entity_id, content_hash, status, next_attempt_at)
values ('apartment', gen_random_uuid(), 'due-1', 'pending', now() - interval '1 minute');
delete from vault.secrets where name in ('project_url', 'embedding_cron_secret');
select throws_ok(
  $$ select pg_temp.run_tick() $$, 'P1523', null,
  'SAN-1523: due work with no Vault secrets raises P1523 instead of failing silently');

-- C4 · due work, secrets present -> exactly one request, right URL, secret header
select vault.create_secret('https://example-project.supabase.co', 'project_url');
select vault.create_secret('test-only-secret-value', 'embedding_cron_secret');
select pg_temp.run_tick();
select is(
  (select count(*) from net.http_request_queue) - (select n from _n where label = 'start'),
  1::bigint,
  'SAN-1523: due work with secrets queues exactly one HTTP request');

select ok(
  (select url = 'https://example-project.supabase.co/functions/v1/process-embedding-jobs'
          and headers ->> 'x-cron-secret' = 'test-only-secret-value'
     from net.http_request_queue order by id desc limit 1),
  'SAN-1523: the request targets the worker and carries the x-cron-secret header');

-- C5 · a crashed worker (processing, lease expired) is picked up again
update _n set n = (select count(*) from net.http_request_queue) where label = 'start';
delete from public.embedding_jobs;
insert into public.embedding_jobs
  (entity_type, entity_id, content_hash, status, lease_token, lease_expires_at, attempts)
values ('apartment', gen_random_uuid(), 'stuck-1', 'processing', gen_random_uuid(), now() - interval '10 minutes', 1);
select pg_temp.run_tick();
select is(
  (select count(*) from net.http_request_queue) - (select n from _n where label = 'start'),
  1::bigint,
  'SAN-1523: a processing job with an expired lease queues a request (crashed worker is retried)');

select * from finish();
rollback;
