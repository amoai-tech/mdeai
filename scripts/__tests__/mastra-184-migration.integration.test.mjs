/**
 * SAN-1698 — additive 1.84 journal migration tested against disposable PostgreSQL.
 *
 * Two independent proofs, because they answer different questions:
 *  1. Catalog/migration shape — runs in one rolled-back transaction.
 *  2. Adapter behaviour — drives the installed WorkflowsPG itself inside a
 *     throwaway database. A handwritten UNION cannot stand in for this: it
 *     re-uses the migration's own column names, so a renamed or retyped journal
 *     column would still pass while the real adapter failed with 42703.
 *
 * Both refuse remote databases. CI sets MASTRA_184_MIGRATION_INTEGRATION=1 and
 * supplies Supabase-equivalent roles.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { Client } from "pg";
// One shared allowlist file, canonicalized on BOTH sides. URL.hostname keeps IPv6
// brackets ("[::1]") while the file stores the bare form, so comparing raw values
// wrongly rejected a loopback IPv6 URL. This file runs under plain `node --test`,
// which cannot import the TypeScript guard that canonicalizes for the vitest
// callers, so the same normalization is applied here.
function canonicalizeHost(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

const LOOPBACK_HOSTS = new Set(
  JSON.parse(fs.readFileSync("src/mastra/lib/integration-loopback-hosts.json", "utf8"))
    .map(canonicalizeHost),
);

function assertLoopback(connectionString, flagName) {
  assert.ok(connectionString, flagName + " is set but DATABASE_URL is missing");
  const host = canonicalizeHost(new URL(connectionString).hostname);
  assert.ok(LOOPBACK_HOSTS.has(host),
    'Refusing to run this proof against non-loopback host "' + host + '" (' + flagName + ").");
}

function databaseScopedUrl(connectionString, database) {
  const url = new URL(connectionString);
  url.pathname = "/" + database;
  return url.toString();
}

const enabled = process.env.MASTRA_184_MIGRATION_INTEGRATION === "1";

test("Mastra 1.84 journal migration is additive, secure and repeatable", { skip: !enabled }, async () => {
  const connectionString = process.env.DATABASE_URL;
  assertLoopback(connectionString, "MASTRA_184_MIGRATION_INTEGRATION");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    await client.query("SET LOCAL lock_timeout = '3000ms'");

    // Simulate a pre-existing production Mastra policy and row. An upgrade
    // cannot reset that policy, alter the row or drop the table.
    await client.query("CREATE TABLE public.mastra_san1698_old (id integer primary key, contents text)");
    await client.query("INSERT INTO public.mastra_san1698_old VALUES (1, 'legacy-chat-preserved')");
    await client.query("ALTER TABLE public.mastra_san1698_old ENABLE ROW LEVEL SECURITY");
    await client.query("ALTER TABLE public.mastra_san1698_old FORCE ROW LEVEL SECURITY");
    await client.query("CREATE POLICY service_role_manage ON public.mastra_san1698_old FOR ALL TO service_role USING (false) WITH CHECK (false)");

    // Compare the whole policy definition, not just its expressions: a migration
    // could widen the role or the command while leaving qual/with_check identical.
    const oldPolicy = async () => (await client.query([
      "SELECT policyname, permissive, roles, cmd, qual, with_check",
      "FROM pg_policies WHERE schemaname='public' AND tablename='mastra_san1698_old'",
      "ORDER BY policyname",
    ].join(" "))).rows;
    // A migration could leave the policy text identical while disabling RLS, which
    // stops PostgreSQL enforcing it. Capture the enforcement flags as well.
    const oldRlsFlags = async () => (await client.query([
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class",
      "WHERE oid='public.mastra_san1698_old'::regclass",
    ].join(" "))).rows[0];
    const before = await oldPolicy();
    const beforeRls = await oldRlsFlags();

    // Pre-upgrade shape: the journal tables do not exist yet. The adapter-level
    // consequence of that is proven in the second test; here we only record the
    // starting catalog state and the legacy row the upgrade must not disturb.
    await client.query([
      'CREATE TABLE public.mastra_workflow_snapshot',
      '(workflow_name text NOT NULL, run_id text NOT NULL, snapshot jsonb NOT NULL,',
      '"createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL,',
      'PRIMARY KEY (workflow_name, run_id))',
    ].join(" "));
    const legacySnapshot = '{"status":"suspended","note":"keep-me"}';
    await client.query([
      'INSERT INTO public.mastra_workflow_snapshot',
      '(workflow_name, run_id, snapshot, "createdAt", "updatedAt")',
      "VALUES ('san1698-workflow', 'legacy-run', $1::jsonb, now(), now())",
    ].join(" "), [legacySnapshot]);
    assert.equal(
      (await client.query("SELECT to_regclass('public.mastra_workflow_runs') AS journal")).rows[0].journal,
      null,
      "journal table must not exist before the migration",
    );

    // CI/npm run from the repository root. Keep the checked-in SQL filename
    // literal so static analysis can verify that no user path is accepted.
    const migrationSql = fs.readFileSync(
      "supabase/migrations/20261120180824_mastra_184_workflow_journal.sql",
      "utf8",
    );
    await client.query(migrationSql);
    await client.query(migrationSql); // replay must never fail or duplicate structures
    assert.notEqual(
      (await client.query("SELECT to_regclass('public.mastra_workflow_runs') AS journal")).rows[0].journal,
      null,
      "migration must create the journal table",
    );
    const preserved = (await client.query([
      "SELECT run_id, snapshot FROM public.mastra_workflow_snapshot",
      "WHERE workflow_name='san1698-workflow'",
    ].join(" "))).rows;
    assert.equal(preserved.length, 1, "legacy v1 suspended run remains readable");
    assert.equal(preserved[0].run_id, "legacy-run");
    // The row surviving is not enough: the migration must not rewrite its state.
    assert.deepEqual(preserved[0].snapshot, JSON.parse(legacySnapshot),
      "legacy suspended snapshot contents must be preserved verbatim");
    assert.deepEqual(await oldPolicy(), before, "old table policy definition changed");
    assert.deepEqual(await oldRlsFlags(), beforeRls, "old table RLS enforcement flags changed");
    assert.equal((await client.query("SELECT contents FROM public.mastra_san1698_old WHERE id=1")).rows[0].contents,
      "legacy-chat-preserved");

    const { rows } = await client.query([
      "SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,",
      "  (SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k",
      "    WHERE k.conrelid=c.oid AND k.contype='p' LIMIT 1) AS pk,",
      "  has_table_privilege('anon',c.oid,'SELECT') AS anon_select,",
      "  has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,",
      "  has_table_privilege('service_role',c.oid,'INSERT') AS service_insert,",
      "  has_table_privilege('service_role',c.oid,'TRUNCATE') AS service_truncate,",
      "  EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public'",
      "    AND p.tablename=c.relname AND p.policyname='service_role_manage') AS service_policy",
      "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace",
      "WHERE n.nspname='public' AND c.relname IN",
      " ('mastra_workflow_runs','mastra_workflow_run_entries') ORDER BY c.relname",
    ].join("\n"));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.rls, true, row.relname + " missing RLS");
      assert.equal(row.force_rls, true, row.relname + " missing FORCE RLS");
      assert.equal(row.anon_select, false, row.relname + " anonymous grant");
      assert.equal(row.auth_select, false, row.relname + " signed-in grant");
      assert.equal(row.service_insert, true, row.relname + " service insert permission");
      assert.equal(row.service_truncate, false, row.relname + " must not grant service TRUNCATE");
      assert.equal(row.service_policy, true, row.relname + " missing service policy");
      assert.ok(row.pk, row.relname + " missing composite PK");
    }
    // Address the tables by name: relying on catalog sort order silently tests
    // the wrong table the moment a name or collation changes.
    const pkFor = (table) => rows.find((row) => row.relname === table)?.pk;
    assert.match(String(pkFor("mastra_workflow_run_entries")), /workflow_name.*run_id.*seq/);
    assert.match(String(pkFor("mastra_workflow_runs")), /workflow_name.*run_id/);
    const indexNames = (await client.query([
      "SELECT indexname FROM pg_indexes WHERE schemaname='public'",
      "AND tablename IN ('mastra_workflow_runs','mastra_workflow_run_entries')",
    ].join(" "))).rows.map((row) => row.indexname);
    for (const name of [
      "mastra_workflow_runs_name_createdat_idx",
      "mastra_workflow_runs_name_status_createdat_idx",
      "mastra_workflow_runs_threadid_idx",
      "mastra_workflow_run_entries_step_idx",
      "mastra_workflow_run_entries_state_base_idx",
    ]) {
      assert.ok(indexNames.includes(name), "missing vendor index " + name);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});

/**
 * Drives the installed @mastra/pg WorkflowsPG against a real legacy database, so
 * the claim under test is the adapter's, not ours:
 *  - before the migration, a v1-only read fails 42P01 on the missing journal table
 *    (the adapter's read SQL names the journal entries table in its outer
 *    projection, so even an explicitly v1-only read resolves that relation and
 *    fails before the migration);
 *  - after the migration, the same calls return the legacy suspended run, with its
 *    state untouched, and the run is listable.
 *
 * A dedicated throwaway database is required because the adapter opens its own
 * connections: it cannot observe DDL that another connection has not committed.
 */
test("WorkflowsPG reads a legacy suspended run only once the journal exists", { skip: !enabled }, async () => {
  const baseUrl = process.env.DATABASE_URL;
  assertLoopback(baseUrl, "MASTRA_184_MIGRATION_INTEGRATION");

  const database = `san1698_adapter_${process.pid}_${Date.now()}`;
  assert.match(database, /^[a-z0-9_]+$/, "generated database name must be a plain identifier");

  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  let store;
  try {
    await admin.query(`CREATE DATABASE ${database}`);

    const scratch = new Client({ connectionString: databaseScopedUrl(baseUrl, database) });
    await scratch.connect();
    try {
      // The pre-upgrade footprint: a v1 snapshot table plus the run-ownership
      // table the previous migration already created. No journal tables.
      await scratch.query([
        'CREATE TABLE public.mastra_workflow_snapshot',
        '(workflow_name text NOT NULL, run_id text NOT NULL, snapshot jsonb NOT NULL,',
        '"createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL,',
        'PRIMARY KEY (workflow_name, run_id))',
      ].join(" "));
      await scratch.query([
        'CREATE TABLE public.mastra_workflow_run_owners',
        '("runId" text PRIMARY KEY NOT NULL, generation bigint NOT NULL,',
        '"ownerId" text NOT NULL, "leaseExpiresAt" bigint, "updatedAt" bigint NOT NULL)',
      ].join(" "));
      const legacySnapshot = { status: "suspended", note: "keep-me" };
      await scratch.query([
        'INSERT INTO public.mastra_workflow_snapshot',
        '(workflow_name, run_id, snapshot, "createdAt", "updatedAt")',
        "VALUES ('san1698-workflow', 'legacy-run', $1::jsonb, now(), now())",
      ].join(" "), [JSON.stringify(legacySnapshot)]);

      const { PostgresStore } = await import("@mastra/pg");
      // disableInit mirrors src/mastra/lib/storage.ts: the runtime never
      // self-heals, which is why the migration has to exist before deploy.
      store = new PostgresStore({
        id: "san1698-adapter-proof",
        connectionString: databaseScopedUrl(baseUrl, database),
        disableInit: true,
      });
      const workflows = await store.getStore("workflows");

      await assert.rejects(
        workflows.getWorkflowRunById({ runId: "legacy-run", workflowName: "san1698-workflow" }),
        (error) => error?.cause?.code === "42P01" || error?.code === "42P01",
        "a v1 read must fail 42P01 while the journal tables are absent",
      );
      await assert.rejects(
        workflows.listWorkflowRuns({ workflowName: "san1698-workflow" }),
        (error) => error?.cause?.code === "42P01" || error?.code === "42P01",
        "listWorkflowRuns must fail 42P01 while the journal tables are absent",
      );

      await scratch.query(fs.readFileSync(
        "supabase/migrations/20261120180824_mastra_184_workflow_journal.sql",
        "utf8",
      ));

      const run = await workflows.getWorkflowRunById({
        runId: "legacy-run", workflowName: "san1698-workflow",
      });
      assert.equal(run?.runId, "legacy-run", "adapter must return the legacy v1 run");
      assert.deepEqual(run?.snapshot, legacySnapshot,
        "adapter must return the legacy suspended state unchanged");

      const listed = await workflows.listWorkflowRuns({ workflowName: "san1698-workflow" });
      assert.equal(listed?.runs?.length, 1, "adapter must list the legacy v1 run");
      assert.equal(listed.runs[0].runId, "legacy-run");
      assert.deepEqual(listed.runs[0].snapshot, legacySnapshot,
        "listed legacy run must keep its suspended state");
    } finally {
      await scratch.end();
    }
  } finally {
    await store?.close?.();
    // DROP DATABASE cannot run inside a transaction and fails while clients remain.
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    } catch (error) {
      // Surface the leftover database instead of reporting a clean run: a silent
      // failure leaves the migrated scratch database behind for the next run.
      console.error(
        `mastra-184-migration: failed to drop scratch database ${database}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
    await admin.end();
  }
});
