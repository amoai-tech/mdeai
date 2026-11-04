/**
 * SAN-1626 — prove the additive Mastra migration preserves unrelated table policies.
 *
 * Opt-in PostgreSQL 17 test; CI uses only a loopback PostgreSQL service.
 * The transaction rolls back all fixtures and migration changes, even on error.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261104031855_mastra_181_run_ownership.sql");
const enabled = process.env.MASTRA_181_MIGRATION_INTEGRATION === "1";

test("Mastra 1.81 migration protects new tables without changing existing policies", { skip: !enabled }, async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  const target = new URL(connectionString);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(target.hostname), "scratch PostgreSQL only");
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    await client.query("SET LOCAL lock_timeout = '3000ms'");
    // A policy on a pre-existing Mastra table must survive this two-table migration.
    await client.query('CREATE TABLE public.mastra_san1626_existing_policy (id integer PRIMARY KEY)');
    await client.query('ALTER TABLE public.mastra_san1626_existing_policy ENABLE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE public.mastra_san1626_existing_policy FORCE ROW LEVEL SECURITY');
    await client.query('CREATE POLICY service_role_manage ON public.mastra_san1626_existing_policy FOR ALL TO service_role USING (false) WITH CHECK (false)');
    const policy = async () => {
      const { rows } = await client.query(
        "SELECT qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mastra_san1626_existing_policy' AND policyname = 'service_role_manage'",
      );
      assert.equal(rows.length, 1);
      return rows[0];
    };
    const before = await policy();
    const migrationSql = fs.readFileSync(MIGRATION, "utf8");
    await client.query(migrationSql);
    await client.query(migrationSql);
    assert.deepEqual(await policy(), before, "migration must not overwrite an existing Mastra policy");

    const { rows } = await client.query(`
      SELECT c.relname,
             c.relrowsecurity AS rls,
             c.relforcerowsecurity AS force_rls,
             EXISTS (
               SELECT 1 FROM pg_constraint p
               WHERE p.conrelid = c.oid AND p.contype = 'p'
                 AND pg_get_constraintdef(p.oid) = 'PRIMARY KEY ("runId")'
             ) AS has_expected_pk,
             has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
             has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('mastra_workflow_run_owners', 'mastra_memory_run_fences')
      ORDER BY c.relname
    `);
    assert.equal(rows.length, 2, "both new tables must be present");
    for (const row of rows) {
      assert.equal(row.rls, true, `${row.relname} RLS`);
      assert.equal(row.force_rls, true, `${row.relname} FORCE RLS`);
      assert.equal(row.has_expected_pk, true, `${row.relname} runId primary key`);
      assert.equal(row.anon_select, false, `${row.relname} anonymous access`);
      assert.equal(row.auth_select, false, `${row.relname} signed-in direct access`);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
