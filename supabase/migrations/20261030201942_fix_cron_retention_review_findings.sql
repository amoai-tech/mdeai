-- Forward-only correction to already-applied cron retention migration.
-- Keep the original migration immutable; production already recorded its version.
-- The scheduled job calls this same function name and requires no rescheduling.
-- Capacity: at most 5,000 history deletes / transaction / day (~1,728 new runs/day).

-- Cron is owned/executed by postgres; do not open private archives to API roles.
grant usage on schema mde_maintenance to postgres;
grant select, insert, update, delete on mde_maintenance.cron_failure_archive to postgres;
create policy cron_failure_archive_operator
  on mde_maintenance.cron_failure_archive
  for all to postgres using (true) with check (true);

-- pg_cron can produce terminal failed rows without either timestamp.
-- Persist the first time the maintenance worker sees them; never backdate them.
create table if not exists mde_maintenance.cron_run_first_seen (
  runid bigint primary key,
  first_observed_at timestamptz not null default now()
);
alter table mde_maintenance.cron_run_first_seen enable row level security;
revoke all on mde_maintenance.cron_run_first_seen from public, anon, authenticated;
grant select, insert, delete on mde_maintenance.cron_run_first_seen to postgres;
create policy cron_first_seen_operator
  on mde_maintenance.cron_run_first_seen
  for all to postgres using (true) with check (true);

create or replace function mde_maintenance.prune_cron_history()
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog
as $body$
declare
  v_cutoff timestamptz := now() - interval '7 days';
  v_runids bigint[];
  v_deleted bigint := 0;
begin
  -- Limit first-observation inserts too; already recorded runs are skipped.
  insert into mde_maintenance.cron_run_first_seen (runid)
  select d.runid
  from cron.job_run_details d
  where d.status = 'failed'
    and d.start_time is null and d.end_time is null
    and not exists (
      select 1 from mde_maintenance.cron_run_first_seen o
      where o.runid = d.runid
    )
  order by d.runid
  limit 5000
  on conflict (runid) do nothing;

  -- One bounded batch, locked until this transaction commits. This selection
  -- is the only age/status eligibility rule used for both archive and delete.
  -- Running/incomplete jobs are never eligible, even when old.
  select array_agg(runid) into v_runids
  from (
    select d.runid
    from cron.job_run_details d
    left join mde_maintenance.cron_run_first_seen o on o.runid = d.runid
    where d.status in ('succeeded', 'failed')
      and coalesce(d.end_time, d.start_time, o.first_observed_at) < v_cutoff
    order by coalesce(d.end_time, d.start_time, o.first_observed_at), d.runid
    limit 5000
    for update of d skip locked
  ) eligible;

  if coalesce(array_length(v_runids, 1), 0) = 0 then
    return 0;
  end if;

  -- Archive each failed selected row before its original may be deleted.
  insert into mde_maintenance.cron_failure_archive (
    runid, jobid, job_pid, database, username, command,
    status, return_message, start_time, end_time
  )
  select
    d.runid, d.jobid, d.job_pid, d.database, d.username, d.command,
    d.status, d.return_message, d.start_time, d.end_time
  from cron.job_run_details d
  where d.runid = any(v_runids)
    and d.status = 'failed'
  on conflict (runid) do nothing;

  delete from cron.job_run_details d
  where d.runid = any(v_runids)
    and (
      d.status = 'succeeded'
      or (d.status = 'failed' and exists (
        select 1 from mde_maintenance.cron_failure_archive a
        where a.runid = d.runid
      ))
    );
  get diagnostics v_deleted = row_count;

  -- Keep first-observation metadata only for source rows actually removed.
  delete from mde_maintenance.cron_run_first_seen o
  where o.runid = any(v_runids)
    and not exists (
      select 1 from cron.job_run_details d where d.runid = o.runid
    );

  return v_deleted;
end;
$body$;

revoke all on function mde_maintenance.prune_cron_history() from public, anon, authenticated;
grant execute on function mde_maintenance.prune_cron_history() to postgres;
