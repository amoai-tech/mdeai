-- Retain recent pg_cron execution history without retaining unlimited successful runs.
-- Older failures are copied into a private, append-only archive before deletion.
-- This migration DOES NOT perform a bulk history purge or alter existing jobs.
-- One-time physical compaction is an explicit separate maintenance transaction.

create schema if not exists mde_maintenance;
revoke all on schema mde_maintenance from public, anon, authenticated;

create table if not exists mde_maintenance.cron_failure_archive (
  runid bigint primary key,
  jobid bigint,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz,
  archived_at timestamptz not null default now()
);

alter table mde_maintenance.cron_failure_archive enable row level security;
revoke all on mde_maintenance.cron_failure_archive from public, anon, authenticated;

comment on table mde_maintenance.cron_failure_archive is
  'Private preservation of pg_cron failed/abnormal runs older than 7 days. No public API access.';

create or replace function mde_maintenance.prune_cron_history()
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog
as $body$
declare
  v_cutoff timestamptz := now() - interval '7 days';
  v_deleted bigint;
begin
  -- Archive every older non-successful completed run before pruning it.
  insert into mde_maintenance.cron_failure_archive (
    runid, jobid, job_pid, database, username, command,
    status, return_message, start_time, end_time
  )
  select
    runid, jobid, job_pid, database, username, command,
    status, return_message, start_time, end_time
  from cron.job_run_details
  where end_time < v_cutoff
    and status is distinct from 'succeeded'
  on conflict (runid) do nothing;

  -- A failed run may only be deleted if its archive copy already exists.
  -- Unfinished runs never meet the cutoff, and remain untouched.
  delete from cron.job_run_details d
  where d.end_time < v_cutoff
    and (
      d.status = 'succeeded'
      or exists (
        select 1 from mde_maintenance.cron_failure_archive a
        where a.runid = d.runid
      )
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$body$;

revoke all on function mde_maintenance.prune_cron_history() from public, anon, authenticated;

-- UTC 02:30 every day; existing embedding, waitlist, analytics and other jobs unchanged.
select cron.schedule(
  'mde_cron_history_retention',
  '30 2 * * *',
  $cron$select mde_maintenance.prune_cron_history();$cron$
);
