-- SAN-1698 · Mastra 1.84 workflow journal: SQL security and index contract.
-- Run on a migrated local Supabase database: supabase test db <this file>.
-- Read-only pgTAP assertions; no live workflow rows or tenant data are changed.
begin;
select plan(26);

-- Both journal relations must exist after the additive migration.
select has_table('public', 'mastra_workflow_runs', 'workflow run headers table exists');
select has_table('public', 'mastra_workflow_run_entries', 'workflow journal entries table exists');

-- RLS must be both enabled and FORCED; service writes still use its policy.
select is((select relrowsecurity from pg_class where oid = 'public.mastra_workflow_runs'::regclass),
  true, 'workflow runs RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.mastra_workflow_runs'::regclass),
  true, 'workflow runs FORCE RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.mastra_workflow_run_entries'::regclass),
  true, 'workflow entries RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.mastra_workflow_run_entries'::regclass),
  true, 'workflow entries FORCE RLS enabled');

-- A client cannot SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER.
-- This checks the full table-level grant set, not merely SELECT.
select is((select count(*)::int from unnest(array[
  'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
]) priv where has_table_privilege('anon', 'public.mastra_workflow_runs', priv)),
  0, 'anon has no workflow run privileges');
select is((select count(*)::int from unnest(array[
  'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
]) priv where has_table_privilege('authenticated', 'public.mastra_workflow_runs', priv)),
  0, 'authenticated has no workflow run privileges');
select is((select count(*)::int from unnest(array[
  'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
]) priv where has_table_privilege('anon', 'public.mastra_workflow_run_entries', priv)),
  0, 'anon has no workflow entry privileges');
select is((select count(*)::int from unnest(array[
  'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
]) priv where has_table_privilege('authenticated', 'public.mastra_workflow_run_entries', priv)),
  0, 'authenticated has no workflow entry privileges');

-- Match only the four grants in the migration, not implicit TRUNCATE privileges.
select ok((select bool_and(has_table_privilege(
  'service_role','public.mastra_workflow_runs', priv))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv),
  'service_role can read and write workflow runs');
select ok((select bool_and(has_table_privilege(
  'service_role','public.mastra_workflow_run_entries', priv))
  from unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv),
  'service_role can read and write workflow entries');
select is(has_table_privilege('service_role','public.mastra_workflow_runs','TRUNCATE'),
  false, 'service_role cannot truncate workflow runs');
select is(has_table_privilege('service_role','public.mastra_workflow_run_entries','TRUNCATE'),
  false, 'service_role cannot truncate workflow entries');

-- A single permissive ALL policy, scoped to the trusted service_role and using
-- true WITH CHECK true. Public and user roles have no equivalent policy.
select is((select count(*)::int from pg_policies
  where schemaname='public' and tablename='mastra_workflow_runs'
    and policyname='service_role_manage' and permissive='PERMISSIVE'
    and roles = array['service_role']::name[]
    and cmd='ALL' and qual='true' and with_check='true'),
  1, 'workflow runs service_role policy matches migration');
select is((select count(*)::int from pg_policies
  where schemaname='public' and tablename='mastra_workflow_runs'),
  1, 'workflow runs permit no extra policies');
select is((select count(*)::int from pg_policies
  where schemaname='public' and tablename='mastra_workflow_run_entries'
    and policyname='service_role_manage' and permissive='PERMISSIVE'
    and roles = array['service_role']::name[]
    and cmd='ALL' and qual='true' and with_check='true'),
  1, 'workflow entries service_role policy matches migration');
select is((select count(*)::int from pg_policies
  where schemaname='public' and tablename='mastra_workflow_run_entries'),
  1, 'workflow entries permit no extra policies');

-- Required composite keys prevent duplicate run headers or journal sequence IDs.
select col_is_pk('public','mastra_workflow_runs',
  array['workflow_name','run_id'], 'workflow run header composite primary key');
select col_is_pk('public','mastra_workflow_run_entries',
  array['workflow_name','run_id','seq'], 'workflow entry composite primary key');

-- The five adapter-generated indexes used for discovery, resume and journal reads.
select has_index('public','mastra_workflow_runs',
  'mastra_workflow_runs_name_createdat_idx', 'name and created-at index exists');
select has_index('public','mastra_workflow_runs',
  'mastra_workflow_runs_name_status_createdat_idx', 'name status and created-at index exists');
select has_index('public','mastra_workflow_runs',
  'mastra_workflow_runs_threadid_idx', 'thread ID lookup index exists');
select has_index('public','mastra_workflow_run_entries',
  'mastra_workflow_run_entries_step_idx', 'workflow step journal index exists');
select has_index('public','mastra_workflow_run_entries',
  'mastra_workflow_run_entries_state_base_idx', 'state-base journal index exists');
-- Compare the COMPLETE normalized predicate. Substring checks passed for
-- `kind <> 'state-base'`, which is partial and mentions both tokens but excludes
-- exactly the rows the index is meant to serve.
select is(
  (select regexp_replace(pg_get_expr(i.indpred, i.indrelid), '\s+', '', 'g')
   from pg_index i join pg_class ix on ix.oid = i.indexrelid
   where ix.relname = 'mastra_workflow_run_entries_state_base_idx'
     and i.indrelid = 'public.mastra_workflow_run_entries'::regclass),
  '(kind=''state-base''::text)',
  'state-base index uses exactly the kind = state-base predicate');

select * from finish();
rollback;
