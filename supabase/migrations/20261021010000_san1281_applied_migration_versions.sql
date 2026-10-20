-- SAN-1281 · let the release gate read which migrations production has actually applied
--
-- Three times a merged migration never reached production (20261018102300, 20261020120000 +
-- 20261020130000, 20261021000000). The application deploy is automatic; the database step is a
-- deliberate operator command, and nothing verified that it had happened before promoting.
--
-- The ledger lives in supabase_migrations and is not exposed through PostgREST. This function is
-- the smallest read that makes the check possible: version strings, already public in the repo.
--
-- Read-only, no arguments, service_role only. It cannot change anything.

create or replace function public.applied_migration_versions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(sm.version order by sm.version), '{}'::text[])
  from supabase_migrations.schema_migrations sm;
$$;

revoke all on function public.applied_migration_versions() from public, anon, authenticated;
grant execute on function public.applied_migration_versions() to service_role;

comment on function public.applied_migration_versions() is
  'Applied migration versions for the release gate. Read-only, service_role only.';