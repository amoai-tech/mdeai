-- SAN-1313 · B1 regression suite — canonical pg_cron replay contract
--
-- Proves the extension and schema exist after a fresh replay, that the documented
-- privileges are present, and — equally important — that B1 changed NOTHING else:
-- no agent_jobs table, no agent_jobs functions touched, and no schedules introduced.
--
-- Run with: supabase test db
begin;

select plan(9);

-- ═══════════════════════════════════════════════════════════════════════════════
-- The extension and its schema
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  exists (select 1 from pg_extension where extname = 'pg_cron'),
  'B1: pg_cron extension is installed after a fresh replay');

select is(
  (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_cron'),
  'pg_catalog',
  'B1: pg_cron is installed in schema pg_catalog (Supabase-supported target)');

select ok(
  to_regclass('cron.job') is not null,
  'B1: the cron schema exists and exposes cron.job');

select ok(
  has_schema_privilege('postgres', 'cron', 'USAGE'),
  'B1: postgres has USAGE on schema cron');

select ok(
  has_table_privilege('postgres', 'cron.job', 'SELECT'),
  'B1: postgres has privileges on cron tables');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B1 changed nothing else — the guardrails against scope creep
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  to_regclass('public.agent_jobs') is null,
  'B1: agent_jobs table NOT recreated');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array['claim_agent_job','complete_agent_job','fail_agent_job',
                                'cleanup_expired_agent_jobs','release_stale_agent_job_locks',
                                'update_agent_job_progress','broadcast_agent_jobs_changes',
                                'realtime_broadcast_agent_jobs'])),
  8, 'B1: the 8 dead agent_jobs functions are UNTOUCHED (still 8; dropping is Migration A)');

select is(
  (select count(*)::int from cron.job),
  0, 'B1: ZERO schedules introduced — this increment is extension-only');

-- Documents the accepted migration-ordering behaviour rather than hiding it:
-- 20260501204538 has a lower timestamp and guards on the extension existing, so it
-- still takes its skip branch during replay. B2 must declare this schedule forward.
select ok(
  not exists (select 1 from cron.job where jobname = 'mdeai_analytics_daily_snapshot'),
  'B1: mdeai_analytics_daily_snapshot still absent in replay (ordering accepted; B2 recreates it forward)');

select * from finish();
rollback;
