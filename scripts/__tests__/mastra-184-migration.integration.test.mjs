/**
 * SAN-1698 — additive 1.84 journal migration tested against disposable PostgreSQL.
 * The test rolls back its complete transaction and refuses remote databases.
 * CI sets MASTRA_184_MIGRATION_INTEGRATION=1 and supplies Supabase-equivalent roles.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261120180824_mastra_184_workflow_journal.sql");
const enabled = process.env.MASTRA_184_MIGRATION_INTEGRATION === "1";

test("Mastra 1.84 journal migration is additive, secure and repeatable", { skip: !enabled }, async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(new URL(connectionString).hostname),
    "scratch PostgreSQL only");

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

    const oldPolicy = async () => (await client.query(
      "SELECT qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='mastra_san1698_old'",
    )).rows;
    const before = await oldPolicy();

    // Real PostgreSQL regression for WorkflowsPG.#runsQuery: Mastra 1.84
    // unions legacy v1 snapshots with v2 journal rows by default.
    await client.query([
      'CREATE TABLE public.mastra_workflow_snapshot',
      '(workflow_name text NOT NULL, run_id text NOT NULL, snapshot jsonb NOT NULL,',
      '"createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL,',
      'PRIMARY KEY (workflow_name, run_id))',
    ].join(" "));
    await client.query([
      'INSERT INTO public.mastra_workflow_snapshot',
      '(workflow_name, run_id, snapshot, "createdAt", "updatedAt")',
      "VALUES ('san1698-workflow', 'legacy-run', '{\"status\":\"suspended\"}'::jsonb, now(), now())",
    ].join(" "));
    const legacyUnion = [
      "SELECT workflow_name, run_id FROM public.mastra_workflow_snapshot",
      "UNION ALL SELECT workflow_name, run_id FROM public.mastra_workflow_runs",
    ].join(" ");
    await client.query("SAVEPOINT missing_journal");
    await assert.rejects(client.query(legacyUnion), (error) => error.code === "42P01");
    await client.query("ROLLBACK TO SAVEPOINT missing_journal");

    const migrationSql = fs.readFileSync(MIGRATION, "utf8");
    await client.query(migrationSql);
    await client.query(migrationSql); // replay must never fail or duplicate structures
    const restored = (await client.query(legacyUnion)).rows;
    assert.equal(restored.length, 1, "legacy v1 suspended run remains readable");
    assert.equal(restored[0].run_id, "legacy-run");
    assert.deepEqual(await oldPolicy(), before, "old table policy changed");
    assert.equal((await client.query("SELECT contents FROM public.mastra_san1698_old WHERE id=1")).rows[0].contents,
      "legacy-chat-preserved");

    const { rows } = await client.query([
      "SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,",
      "  (SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k",
      "    WHERE k.conrelid=c.oid AND k.contype='p' LIMIT 1) AS pk,",
      "  has_table_privilege('anon',c.oid,'SELECT') AS anon_select,",
      "  has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,",
      "  has_table_privilege('service_role',c.oid,'INSERT') AS service_insert,",
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
      assert.equal(row.service_policy, true, row.relname + " missing service policy");
      assert.ok(row.pk, row.relname + " missing composite PK");
    }
    assert.match(rows[0].pk, /workflow_name.*run_id.*seq/);
    assert.match(rows[1].pk, /workflow_name.*run_id/);
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
