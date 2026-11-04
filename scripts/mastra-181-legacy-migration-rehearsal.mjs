#!/usr/bin/env node
/**
 * SAN-1626 step 3.12 — automated legacy → migrated rehearsal.
 *
 * The unit and migration tests prove the SQL in isolation; this proves the *sequence*
 * that production actually goes through, on a disposable database:
 *
 *   legacy 32-table schema  →  workflow start FAILS with 42P01  →  apply the real
 *   versioned migration  →  workflow start SUCCEEDS  →  applying it twice is safe
 *
 * Why a separate script: `storage-durability.integration.test.ts` asserts the workflow
 * works. It cannot assert that the SAME database failed a moment earlier for the exact
 * reason the migration exists. Reproducing the defect is the guard against a future
 * migration that "passes" because someone pre-created the tables.
 *
 * Loopback only, no remote escape hatch (same host list as the TypeScript guard), because
 * it drops and recreates tables.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
 *     node scripts/mastra-181-legacy-migration-rehearsal.mjs
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATION = `${ROOT}supabase/migrations/20261104031855_mastra_181_run_ownership.sql`;
const DURABILITY_TEST = "src/mastra/lib/storage-durability.integration.test.ts";
const REQUIRED_TABLES = ["mastra_workflow_run_owners", "mastra_memory_run_fences"];

const LOOPBACK_HOSTS = new Set(
  JSON.parse(readFileSync(`${ROOT}src/mastra/lib/integration-loopback-hosts.json`, "utf8")),
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("mastra-181-legacy-rehearsal: DATABASE_URL is required");
  process.exit(1);
}
const host = new URL(connectionString).hostname.replace(/^\[|\]$/g, "").toLowerCase();
if (!LOOPBACK_HOSTS.has(host)) {
  console.error(
    `mastra-181-legacy-rehearsal: refusing non-loopback host "${host}". This script drops tables.`,
  );
  process.exit(1);
}

const MIGRATION_SQL = readFileSync(MIGRATION, "utf8");
/** Runs the real durability integration test and returns its combined output + status. */
function runWorkflowProof() {
  const result = spawnSync("npx", ["vitest", "run", DURABILITY_TEST], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, VEB_MVP_010_INTEGRATION: "1" },
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const client = new Client({ connectionString });
await client.connect();
try {
  // 1 — reproduce the legacy footprint.
  for (const table of REQUIRED_TABLES) {
    await client.query(`drop table if exists public."${table}" cascade`);
  }
  const { rows: leftover } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])`,
    [REQUIRED_TABLES],
  );
  check(leftover.length === 0, `legacy fixture still had ${leftover.length} of the two tables`);
  console.log("[1/5] legacy footprint: both run-ownership tables absent");

  // 2 — the defect must reproduce. A migration whose absence is undetectable is untested.
  const before = runWorkflowProof();
  check(before.status !== 0, "workflow start did NOT fail on the legacy schema — the 42P01 regression is not reproducible");
  check(
    /42P01/.test(before.output) || /does not exist/.test(before.output),
    "legacy workflow failure was not the expected missing-relation error",
  );
  console.log(`[2/5] red before migration: ${/42P01/.test(before.output) ? "42P01" : "missing relation"}`);

  // 3 — apply the real versioned migration, twice, to prove repeat safety.
  await client.query(MIGRATION_SQL);
  await client.query(MIGRATION_SQL);
  console.log("[3/5] migration applied twice (repeat-safe)");

  // 4 — the migrated tables must be complete and server-only.
  const { rows: shape } = await client.query(
    `select c.relname,
            c.relrowsecurity as rls,
            c.relforcerowsecurity as force_rls,
            coalesce((select pg_get_constraintdef(p.oid) from pg_constraint p
                       where p.conrelid = c.oid and p.contype = 'p'), 'NONE') as pk
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])
      order by c.relname`,
    [REQUIRED_TABLES],
  );
  check(shape.length === 2, `expected 2 migrated tables, found ${shape.length}`);
  for (const row of shape) {
    check(row.rls === true, `${row.relname}: RLS not enabled`);
    check(row.force_rls === true, `${row.relname}: RLS not forced`);
    check(row.pk === 'PRIMARY KEY ("runId")', `${row.relname}: unexpected primary key ${row.pk}`);
  }
  const { rows: exposure } = await client.query(
    `select count(*)::int as n from unnest(array['anon','authenticated']) r,
            unnest($1::text[]) t
      where has_table_privilege(r, format('public.%I', t), 'SELECT')`,
    [REQUIRED_TABLES],
  );
  check(exposure[0].n === 0, `${exposure[0].n} client role(s) can still read the migrated tables`);
  console.log(`[4/5] schema: ${shape.length} tables, PK+RLS verified, ${exposure[0].n} client grants`);

  // 5 — same workflow, same database, now green.
  const after = runWorkflowProof();
  check(after.status === 0, "workflow still fails after the migration");
  console.log(`[5/5] green after migration: workflow start + cold-start resume`);
} finally {
  await client.end().catch(() => undefined);
}

if (failures.length) {
  console.error("\nmastra-181-legacy-rehearsal: FAIL");
  for (const failure of failures) console.error(`  * ${failure}`);
  process.exit(1);
}
console.log("\nmastra-181-legacy-rehearsal: PASS — legacy failure, migration, recovery, repeat-safety");
