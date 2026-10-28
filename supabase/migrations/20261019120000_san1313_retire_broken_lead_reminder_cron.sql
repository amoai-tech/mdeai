-- SAN-1313 · Retire the broken `mdeai_lead_reminder_tick` schedule
--
-- WHY
-- The job calls the deployed Edge Function `lead-reminder-tick` every 5 minutes. That function
-- (Landlord V1, D11.5) claims rows by updating `landlord_inbox.reminder_sent_at`, a column that
-- does not exist. Every call therefore returns HTTP 500 (71 in a row when checked on 2026-10-18).
-- pg_cron still reports "succeeded", because it only records that the request was queued; the
-- real answer is in `net._http_response`. `landlord_inbox` holds zero rows, so nothing is lost,
-- and the current rental viewing flow does not use this function.
--
-- WHAT THIS DOES
--   * Removes only `mdeai_lead_reminder_tick` through the documented `cron.unschedule`.
--   * Guarded on existence, because `cron.unschedule` raises for an unknown name. A re-run, or a
--     replay that never had the job, is a no-op.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * Does not delete the Edge Function `lead-reminder-tick` or the Vault secret
--     `lead_reminder_cron_secret`. If broker reminders are rebuilt for the current viewing flow,
--     that is a separate task with its own schedule.
--   * Does not touch `cron.job_run_details` (run history is kept) or any other job.
--
-- The approved list after this migration is four jobs; supabase/tests/database/
-- san1313b_pg_cron_schedule_replay_test.sql asserts it as a set.

do $retire$
begin
  if exists (select 1 from cron.job where jobname = 'mdeai_lead_reminder_tick') then
    perform cron.unschedule('mdeai_lead_reminder_tick');
  end if;
end
$retire$;
