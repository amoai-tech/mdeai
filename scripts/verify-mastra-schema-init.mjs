#!/usr/bin/env node
/**
 * SAN-1321 — prove a REAL database provisions the committed Mastra contract.
 *
 * Why this exists
 * ---------------
 * `check-mastra-schema-contract.mjs` compares the *installed package versions*
 * against the contract. That is necessary but not sufficient: a correctly paired
 * adapter could still create the wrong table set. This script closes that gap by
 * running the real initializer against a real database and diffing what it
 * actually created against `scripts/mastra-schema-contract.json`.
 *
 * It is opt-in (not part of `floor`, which has no database):
 *
 *   DATABASE_URL=postgresql://… npm run check:mastra:schema:init
 *
 * Use a scratch/local database. The initializer is idempotent, but this is a
 * provisioning check, not something to point at production.
 *
 * Exit codes: 0 = every contract table present; 1 = missing tables, an
 * unreachable database, or no DATABASE_URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { PostgresStore } from "@mastra/pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const contractPath = argValue("--contract") ?? path.join(ROOT, "scripts/mastra-schema-contract.json");
const connectionString = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "").trim();

if (!connectionString) {
  console.error(
    "mastra-schema-init-check: DATABASE_URL is required.\n" +
      "  local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run check:mastra:schema:init",
  );
  process.exit(1);
}

let expected;
try {
  expected = JSON.parse(fs.readFileSync(contractPath, "utf8")).expectedTables;
} catch (error) {
  console.error(`mastra-schema-init-check: cannot read ${contractPath}: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(expected) || expected.length === 0) {
  console.error("mastra-schema-init-check: contract lists no expected tables");
  process.exit(1);
}

/** Host/database only — never echo credentials. */
function safeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

const store = new PostgresStore({ id: "mastra-schema-init-check", connectionString });
const client = new Client({ connectionString });

try {
  console.log(`mastra-schema-init-check: provisioning ${safeTarget(connectionString)}`);
  await store.init();

  await client.connect();
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mastra\\_%'",
  );
  const actual = new Set(rows.map((r) => r.table_name));

  const missing = expected.filter((t) => !actual.has(t));
  const extra = [...actual].filter((t) => !expected.includes(t));

  console.log(`  contract expects     : ${expected.length}`);
  console.log(`  database provisioned : ${actual.size}`);
  console.log(`  missing vs contract  : ${missing.length}${missing.length ? ` — ${missing.join(", ")}` : ""}`);
  console.log(`  extra vs contract    : ${extra.length}${extra.length ? ` — ${extra.join(", ")}` : ""}`);

  if (missing.length) {
    console.error(
      `\nmastra-schema-init-check: FAIL — the initializer did not create ${missing.length} contract table(s).`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nmastra-schema-init-check: OK — every contract table was provisioned.");
  }
} catch (error) {
  console.error(
    `mastra-schema-init-check: FAILED — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  // Both of these hold open handles: the pg Client and the PostgresStore's own
  // pool. Leaving either unclosed keeps the event loop alive, so the script would
  // print its verdict and then hang instead of exiting — unusable in CI.
  await client.end().catch(() => undefined);
  await store.close().catch(() => undefined);
}
