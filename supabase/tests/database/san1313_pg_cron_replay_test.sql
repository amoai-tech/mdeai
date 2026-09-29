-- SAN-1313 · B1 regression suite — canonical pg_cron replay contract
--
-- Proves the extension and schema exist after a fresh replay, that the documented
-- privileges are present, and — equally important — that B1 changed NOTHING else:
-- no agent_jobs table and no resurrected agent_jobs function.
--
-- SCOPE NARROWED (2026-09-28): the two schedule assertions this file used to carry were
-- transitional. B2 now declares the approved schedules forward, so they are false by design
-- and have moved to san1313b_pg_cron_schedule_replay_test.sql. See the note at the end.
--
-- CROSS-TASK EDIT (2026-09-18): assertion 7 originally pinned "the 8 dead agent_jobs
-- functions are still present", which was B1's way of proving it had not overreached.
-- SAN-1313 Migration A now deliberately drops those 8, so the replay contract has been
-- flipped to the post-Migration-A truth: 0 remain. Migration A owns that outcome; this
-- file still pins that B1 itself created none of them and resurrected no table.
--
-- Run with: supabase test db
begin;

select plan(7);

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
  0, 'B1/A: 0 dead agent_jobs functions remain (B1 added none; Migration A dropped all 8)');

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEDULE ASSERTIONS MOVED TO B2 (2026-09-28)
--
-- This file previously pinned two transitional truths:
--   * `count(*) from cron.job = 0`
--   * `mdeai_analytics_daily_snapshot` still absent, documenting the accepted ordering
--     behaviour where 20260501204538 skips because it runs before pg_cron exists.
--
-- Both were correct for B1 and are now FALSE by design: B2
-- (20260928130000_san1313b_canonical_cron_schedules) declares all four approved schedules
-- forward, which is exactly what those comments said had to happen.
--
-- They now live in san1313b_pg_cron_schedule_replay_test.sql as an exact-manifest assertion.
-- This file keeps only what B1 owns: the extension, its schema, the documented privileges,
-- and the guarantee that B1/A resurrected no dead agent_jobs object.
-- ─────────────────────────────────────────────────────────────────────────────

select * from finish();
rollback;
