/**
 * SAN-1368 — lock every runtime-created `public.mastra_*` table to the trusted server path.
 *
 * THE HOLE THIS CLOSES
 * --------------------
 * `supabase/migrations/20260517144706_mastra_public_tables_rls_lockdown.sql` walks the
 * `mastra_*` tables that exist **when the migration runs**. On a fresh environment the order
 * is: `supabase db reset` replays migrations (no Mastra tables yet — the vendor tables are
 * only created later by `PostgresStore.init()`), then `npm run mastra:init` creates all 43
 * tables. The migration therefore loops over zero tables and every new table is created
 * **without RLS**, reachable by `anon` / `authenticated` through PostgREST.
 *
 * The migration stays (it protects an environment whose tables already exist). This module is
 * the reliable path: it is applied by the initializer **after** the vendor tables exist, so a
 * brand-new environment cannot be promoted before its Mastra storage is locked down.
 *
 * ROLE-AWARE BY DESIGN
 * --------------------
 * `anon`, `authenticated` and `service_role` are Supabase roles. The `mastra-schema-init` CI
 * job runs a plain `postgres:17`, which has none of them, so policy creation and the grant
 * revocation are conditional on the role actually existing. RLS is enabled and forced either
 * way — the part that must hold on every Postgres.
 */

/** Every runtime-created table under this prefix must be locked. */
export const MASTRA_TABLE_PREFIX = "mastra_";

/** The only policy name the lockdown creates; asserted by verify-mastra-schema-init.mjs. */
export const MASTRA_LOCKDOWN_POLICY = "service_role_manage";

export const MASTRA_STORAGE_LOCKDOWN_SQL = `
DO $$
DECLARE
  t text;
  has_service_role boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND starts_with(c.relname, 'mastra_')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    IF has_service_role THEN
      EXECUTE format('DROP POLICY IF EXISTS service_role_manage ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY service_role_manage ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t
      );
    END IF;

    IF has_anon THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF has_authenticated THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
`;

/** Apply the lockdown on an open client. Safe to re-run: RLS and the policy are idempotent. */
export async function applyMastraStorageLockdown(client) {
  await client.query(MASTRA_STORAGE_LOCKDOWN_SQL);
}

/** Open a client, apply the lockdown, close it. */
export async function applyMastraStorageLockdownTo(connectionString) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await applyMastraStorageLockdown(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}
