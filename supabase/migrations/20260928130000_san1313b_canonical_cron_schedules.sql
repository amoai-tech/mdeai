-- SAN-1313 · B2 — canonical cron schedules, reproducible from Git
--
-- WHY
-- Production has always had cron schedules; this repository never declared them. A database
-- rebuilt from `supabase/migrations/**` installs pg_cron (B1: 20260918050339) but ends up with
-- **zero schedules**, because the only `cron.schedule(...)` in the tree lives in
-- 20260501204538_landlord_v1_response_metrics.sql behind
--
--     IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN ... RETURN;
--
-- That migration has a LOWER timestamp than the B1 install, so during replay it still runs
-- before pg_cron exists, still takes its skip branch, and `mdeai_analytics_daily_snapshot` is
-- never created. Editing it is forbidden — it is already applied. Every schedule therefore has
-- to be declared FORWARD from here.
--
-- THE APPROVED MANIFEST — four retained jobs, one retirement
--
--   mdeai_lead_reminder_tick     */5 * * * *   KEEP (Edge via pg_net + Vault)
--   mdeai_analytics_daily_snapshot  10 3 * * *   KEEP (direct SQL)
--   wait_list_expire_holds       */5 * * * *   KEEP (direct SQL)
--   chat-lead-followup-check     0 14 * * *   KEEP (direct SQL)
--
--   chat-archive-abandoned       0 6 * * *   RETIRE
--
-- `chat-archive-abandoned` is deliberately NOT migrated. `public.conversations` was dropped,
-- so the job has failed **every day for 14 consecutive days** (14/14 in the last 14 days; last
-- success 2026-05-23) with `relation "conversations" does not exist`. Migrating a known-broken
-- job into a fresh environment would reproduce a defect, not a contract.
--
-- IDEMPOTENT BY CONSTRUCTION
-- `cron.schedule(jobname, schedule, command)` updates the existing named job when the name is
-- already present, so re-running this migration cannot duplicate a schedule. Names are always
-- supplied explicitly — an unnamed job cannot be re-addressed or retired deterministically.
-- The retirement is guarded on existence because `cron.unschedule` raises when the name is
-- unknown, which is exactly the case during a fresh replay.
--
-- ENVIRONMENT SAFETY — no production URL in this file
-- The live Edge job hardcodes `https://zkwcbyxiwklihegjhuql.supabase.co`. That is NOT copied
-- here: a dev, preview or recovery database replaying this migration would otherwise queue
-- HTTP calls at production. The URL is resolved at run time from the Vault secret
-- `project_url`, and a missing or empty secret raises before `net.http_post` is ever reached,
-- so a misconfigured environment fails loudly instead of failing opaquely.
--
-- NOT IN SCOPE, DELIBERATELY
--   * pg_cron is NOT upgraded or relocated (stays 1.6.4 in `pg_catalog`).
--   * `cron.job_run_details` is NOT touched. Retaining run history is intentional; retention
--     policy is a separate concern and destructive history DML does not belong in a replay fix.
--   * No direct writes to `cron.job`. Only the documented `cron.schedule` / `cron.unschedule`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · mdeai_lead_reminder_tick — Edge Function via pg_net, environment-resolved
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'mdeai_lead_reminder_tick',
  '*/5 * * * *',
  $cron$
    do $guard$
    declare
      v_project_url text;
      v_cron_secret text;
    begin
      select decrypted_secret into v_project_url
      from vault.decrypted_secrets
      where name = 'project_url';

      if v_project_url is null or btrim(v_project_url) = '' then
        raise exception
          'SAN-1313: Vault secret "project_url" is missing or empty. Provision it before this schedule can run. Refusing to guess a target host.'
          using errcode = 'P1313';
      end if;

      select decrypted_secret into v_cron_secret
      from vault.decrypted_secrets
      where name = 'lead_reminder_cron_secret';

      if v_cron_secret is null or btrim(v_cron_secret) = '' then
        raise exception
          'SAN-1313: Vault secret "lead_reminder_cron_secret" is missing or empty. Provision it before this schedule can run.'
          using errcode = 'P1313';
      end if;

      perform net.http_post(
        url     := rtrim(v_project_url, '/') || '/functions/v1/lead-reminder-tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', v_cron_secret
        ),
        body    := '{}'::jsonb
      );
    end
    $guard$;
  $cron$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · mdeai_analytics_daily_snapshot — direct SQL
-- The command body is unchanged from production; only the declaration location moves.
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'mdeai_analytics_daily_snapshot',
  '10 3 * * *',
  $cron$ select public.snapshot_analytics_events_daily((current_date - 1)); $cron$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · wait_list_expire_holds — direct SQL
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'wait_list_expire_holds',
  '*/5 * * * *',
  $cron$
    update public.event_wait_list
    set status = 'expired'
    where status = 'notified'
      and hold_expires_at < pg_catalog.now();

    -- for each expired hold, notify the next person in line
    select public.fn_notify_next_in_line(ticket_type_id)
    from (
      select distinct ticket_type_id
      from public.event_wait_list
      where status = 'expired'
        and notified_at > pg_catalog.now() - interval '6 minutes'
    ) expired_types;
  $cron$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · chat-lead-followup-check — direct SQL
-- Depends on leads.next_followup_at and leads.pipeline_stage, both supplied by
-- 20260918090603_san1304a_recover_missing_column_contracts.sql (already applied).
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'chat-lead-followup-check',
  '0 14 * * *',
  $cron$
    update leads
    set status = 'stale',
        updated_at = now()
    where status = 'contacted'
      and next_followup_at < now()
      and pipeline_stage not in ('closed_won', 'closed_lost');
  $cron$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Retire chat-archive-abandoned
-- Guarded: `cron.unschedule` raises if the name is unknown, which is the normal case on a
-- fresh replay. Retiring a job that is not there is a no-op, not an error.
-- ─────────────────────────────────────────────────────────────────────────────

do $retire$
begin
  if exists (select 1 from cron.job where jobname = 'chat-archive-abandoned') then
    perform cron.unschedule('chat-archive-abandoned');
  end if;
end
$retire$;
