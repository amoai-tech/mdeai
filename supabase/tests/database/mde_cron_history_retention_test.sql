-- Exercise cron retention against rollback-only fixtures in a local database.
-- Never run these data-mutating fixtures against the connected production project.
begin;
select plan(24);

select ok(
  exists (select 1 from pg_policies
    where schemaname='mde_maintenance'
      and tablename='cron_failure_archive'
      and policyname='cron_failure_archive_operator'
      and 'postgres'=any(roles)),
  'archive explicitly authorizes the cron postgres operator');

select ok(
  not has_schema_privilege('anon','mde_maintenance','usage')
  and not has_schema_privilege('authenticated','mde_maintenance','usage')
  and not has_table_privilege('anon','mde_maintenance.cron_failure_archive','select'),
  'anonymous and authenticated clients cannot read private archive');

select ok(
  has_table_privilege('postgres','mde_maintenance.cron_failure_archive','select')
  and has_function_privilege('postgres','mde_maintenance.prune_cron_history()','execute'),
  'postgres maintenance operator can read failures and run pruning');

select ok(
  not has_function_privilege('anon','mde_maintenance.prune_cron_history()','execute'),
  'anonymous role cannot invoke pruning');

insert into cron.job_run_details (runid, jobid, status, start_time, end_time)
values
  (-991001, 999, 'succeeded', now()-interval '9 days', now()-interval '9 days'),
  (-991002, 999, 'failed', now()-interval '9 days', now()-interval '9 days'),
  (-991003, 999, 'succeeded', now()-interval '1 day', now()-interval '1 day'),
  (-991004, 999, 'running', now()-interval '9 days', null),
  (-991005, 999, 'failed', null, null),
  (-991006, 999, 'failed', null, null),
  (-991007, 999, 'running', null, null),
  (-991008, 999, 'failed', now()-interval '9 days', null),
  (-991009, 999, 'failed', now()-interval '1 day', null);

insert into mde_maintenance.cron_run_first_seen (runid, first_observed_at)
values (-991005, now()-interval '8 days');

select is(mde_maintenance.prune_cron_history(), 4::bigint,
  'only four expired terminal fixture runs are removed');

select is((select count(*)::int from cron.job_run_details
  where runid in (-991001,-991002,-991005,-991008)), 0,
  'expired successful and archived failed runs leave hot history');

select is((select count(*)::int from mde_maintenance.cron_failure_archive
  where runid in (-991002,-991005,-991008)), 3,
  'all three removed failed fixture runs are archived');

select is((select count(*)::int from mde_maintenance.cron_failure_archive
  where runid in (-991001,-991003,-991004,-991006,-991007,-991009)), 0,
  'successful, running, recent and unaged failed fixture runs are not archived');

select ok(exists (select 1 from cron.job_run_details where runid=-991003),
  'recent success remains');

select ok(exists (select 1 from cron.job_run_details where runid=-991004),
  'old running row with a timestamp remains');

select ok(exists (select 1 from cron.job_run_details where runid=-991007),
  'running row with both timestamps absent remains');

select ok(exists (select 1 from cron.job_run_details where runid=-991006),
  'newly observed timestamp-less failure remains at least seven more days');

select ok(exists (select 1 from cron.job_run_details where runid=-991009),
  'recent failure with no end time remains');

select ok(exists (select 1 from mde_maintenance.cron_run_first_seen
  where runid=-991006 and first_observed_at >= now()-interval '1 minute'),
  'timestamp-less failed run receives a persisted first-observed time');

select is((select count(*)::int from mde_maintenance.cron_run_first_seen
  where runid=-991005), 0,
  'first-observed metadata is removed when its history row is removed');

select is(mde_maintenance.prune_cron_history(), 0::bigint,
  'repeat call is idempotent when no old rows remain');

select is((select count(*)::int from mde_maintenance.cron_failure_archive
  where runid in (-991002,-991005,-991008)), 3,
  'repeat call does not duplicate archived failures');

-- A large simulated backlog must be processed across separate invocations.
insert into cron.job_run_details (runid,jobid,status,start_time,end_time)
select -800000 - n, 999, 'succeeded',
       now()-interval '9 days', now()-interval '9 days'
from generate_series(1,5001) n;

select is(mde_maintenance.prune_cron_history(),5000::bigint,
  'one invocation deletes no more than 5000 eligible rows');

select is((select count(*)::int from cron.job_run_details
  where runid between -805001 and -800001),1,
  'oversized backlog leaves exactly one row after bounded call');

select is(mde_maintenance.prune_cron_history(),1::bigint,
  'next invocation drains remaining backlog');

select is((select count(*)::int from cron.job_run_details
  where runid between -805001 and -800001),0,
  'all synthetic backlog is drained across calls');

select is((select count(*)::int from mde_maintenance.cron_failure_archive
  where runid between -805001 and -800001),0,
  'successful large-backlog runs never enter failure archive');

select is((select count(*)::int from cron.job where active),5,
  'all five local replay jobs remain active');

select ok((select relrowsecurity from pg_class
  where oid='mde_maintenance.cron_run_first_seen'::regclass),
  'first-observed helper is RLS-protected');

select * from finish();
rollback;
