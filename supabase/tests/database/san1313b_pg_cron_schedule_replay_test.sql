-- SAN-1313 · B2 regression suite — the approved cron manifest, exactly
--
-- WHAT THIS LOCKS IN
--   1. A fresh replay ends with EXACTLY the four approved named jobs — as a set, not a count.
--   2. Each job carries its approved schedule, and all four are active.
--   3. The retired `chat-archive-abandoned` job is absent and cannot come back.
--   4. The Edge-backed job resolves its target from Vault and contains no literal Supabase URL,
--      so a replayed dev/recovery database can never call production.
--   5. No dead `agent_jobs` function returns.
--   6. Every direct-SQL command's dependencies still exist, so a structural pass cannot hide a
--      command that would fail the moment pg_cron ran it.
--
-- WHY SET EQUALITY AND NOT A COUNT
-- `count(*) = 4` passes when one approved job is missing and a stray fifth job has appeared.
-- Assertion 2 compares the sorted jobname array against the approved manifest, so an extra job
-- and a missing job both fail. Assertions 3 and 13 cover the specific regressions this task
-- exists to prevent.
--
-- WHY DEPENDENCY RESOLUTION IS ASSERTED HERE (assertions 14–17)
-- pg_cron stores a schedule as text. A schedule can therefore assert perfectly in `cron.job` and
-- still fail on every run because a relation, function or column it names was dropped. That is
-- precisely how `chat-archive-abandoned` failed 14 days in a row after `public.conversations`
-- was removed. Asserting the command targets exist closes that gap; it does not execute them.
--
-- RED → GREEN
--   RED   before 20260928130000: replay has ZERO schedules, so assertions 1–9 fail.
--   GREEN after it.
--
-- Run with: supabase test db

begin;

select plan(17);

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · The exact approved manifest
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from cron.job),
  4,
  'B2: exactly four cron jobs exist after a fresh replay');

select is(
  (select array_agg(jobname order by jobname) from cron.job),
  array['chat-lead-followup-check',
        'mdeai_analytics_daily_snapshot',
        'mdeai_lead_reminder_tick',
        'wait_list_expire_holds'],
  'B2: the job set is EXACTLY the four approved names (extra or missing both fail)');

select ok(
  not exists (select 1 from cron.job where jobname = 'chat-archive-abandoned'),
  'B2: the retired chat-archive-abandoned job is absent');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · Exact schedules — a wrong cadence is a silent production behaviour change
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select schedule from cron.job where jobname = 'mdeai_lead_reminder_tick'),
  '*/5 * * * *',
  'B2: mdeai_lead_reminder_tick runs every 5 minutes');

select is(
  (select schedule from cron.job where jobname = 'mdeai_analytics_daily_snapshot'),
  '10 3 * * *',
  'B2: mdeai_analytics_daily_snapshot runs at 03:10 daily');

select is(
  (select schedule from cron.job where jobname = 'wait_list_expire_holds'),
  '*/5 * * * *',
  'B2: wait_list_expire_holds runs every 5 minutes');

select is(
  (select schedule from cron.job where jobname = 'chat-lead-followup-check'),
  '0 14 * * *',
  'B2: chat-lead-followup-check runs at 14:00 daily');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · Runtime contract — active, correct database/role, unchanged timezone
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from cron.job where active),
  4,
  'B2: all four approved jobs are active');

select is(
  (select count(*)::int from cron.job
    where database = 'postgres' and username = 'postgres'),
  4,
  'B2: all four jobs run as postgres on the postgres database');

-- pg_cron timezone is GLOBAL, not per job. Pinned because changing it would shift every
-- business-hour schedule at once.
select is(
  current_setting('cron.timezone', true),
  'GMT',
  'B2: cron.timezone remains GMT (global, not per-job)');

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · Environment safety — the Edge job must not hardcode a host
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  not exists (
    select 1 from cron.job
    where jobname = 'mdeai_lead_reminder_tick'
      and command ~* 'https?://[a-z0-9-]+\.supabase\.(co|in)'),
  'B2: the Edge cron command contains NO literal Supabase URL (resolved from Vault instead)');

select ok(
  (select command from cron.job where jobname = 'mdeai_lead_reminder_tick')
    like '%project_url%'
  and
  (select command from cron.job where jobname = 'mdeai_lead_reminder_tick')
    like '%lead_reminder_cron_secret%',
  'B2: the Edge cron command resolves project_url and lead_reminder_cron_secret from Vault');

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · No dead baggage returns
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array['claim_agent_job','complete_agent_job','fail_agent_job',
                                'cleanup_expired_agent_jobs','release_stale_agent_job_locks',
                                'update_agent_job_progress','broadcast_agent_jobs_changes',
                                'realtime_broadcast_agent_jobs'])),
  0,
  'B2: 0 dead agent_jobs functions remain');

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · Command dependencies resolve — a stored command that cannot run is not a contract
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'snapshot_analytics_events_daily'),
  'B2: snapshot_analytics_events_daily() exists for the analytics job');

select ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'fn_notify_next_in_line'),
  'B2: fn_notify_next_in_line() exists for the wait-list job');

select ok(
  to_regclass('public.event_wait_list') is not null,
  'B2: event_wait_list exists for the wait-list job');

-- Both columns are supplied by 20260918090603_san1304a_recover_missing_column_contracts.sql.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name in ('next_followup_at', 'pipeline_stage')),
  2,
  'B2: leads.next_followup_at and leads.pipeline_stage both exist for the follow-up job');

select * from finish();
rollback;
