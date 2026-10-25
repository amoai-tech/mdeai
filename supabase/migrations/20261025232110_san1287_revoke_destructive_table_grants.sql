-- SAN-1287 · MDE Security — Stop Unauthorized Access to Customer and Business Data
-- Remove SQL-level TRUNCATE from visitor roles on application-owned public
-- tables. PostgreSQL does not apply row-level security to TRUNCATE.
--
-- Only postgres-owned, non-extension tables in the MDE public schema are
-- touched; PostGIS-managed spatial_ref_sys and other extension objects are
-- intentionally excluded. Retain all existing SELECT/INSERT/UPDATE/DELETE,
-- REFERENCES/TRIGGER, service_role and owner grants unchanged.
-- Future-creator default grants belong to SAN-1572, not this migration.
--
-- Replay-safe: revoking a privilege more than once is harmless. Re-evaluating
-- the ownership predicate on a clean rebuild avoids a stale hardcoded table
-- list while covering every application-owned table as of migration time.

do $$
declare
  target_table record;
begin
  for target_table in
    select c.oid::regclass as relation
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles owner_role on owner_role.oid = c.relowner
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and owner_role.rolname = 'postgres'
       and not exists (
         select 1
           from pg_depend dep
          where dep.classid = 'pg_class'::regclass
            and dep.objid = c.oid
            and dep.deptype = 'e'
       )
  loop
    execute format(
      'revoke truncate on table %s from public, anon, authenticated',
      target_table.relation
    );
  end loop;
end;
$$;
