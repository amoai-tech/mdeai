#!/usr/bin/env node
/**
 * SAN-1311 — drop the optional `adapterInitExtraTables` from a scratch database so the
 * runtime proofs can show the upgraded runtime does not require them.
 *
 * Used only by the disposable `mastra-schema-init` Postgres in
 * `.github/workflows/floor.yml`. This script runs `DROP TABLE ... CASCADE`, so it is
 * **loopback-only with no remote escape hatch**: an accidentally exported production
 * DATABASE_URL can never cause a real table to be dropped. Identifiers are validated
 * against the contract and the contract must not label a required table as optional. An
 * empty optional list is a valid zero-work case for a future adapter.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

/**
 * Hosts that can only ever be the local machine. Read from the same source of truth as the
 * TypeScript guard so the two enforcement paths cannot drift. `::` is NOT loopback.
 */
const LOOPBACK_HOSTS = new Set(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../src/mastra/lib/integration-loopback-hosts.json", import.meta.url)),
      "utf8",
    ),
  ),
);
const IDENTIFIER = /^mastra_[a-z0-9_]+$/;

const contract = JSON.parse(
  readFileSync(fileURLToPath(new URL("./mastra-schema-contract.json", import.meta.url)), "utf8"),
);
const expectedTables = Array.isArray(contract.expectedTables) ? contract.expectedTables : [];
const tables = Array.isArray(contract.adapterInitExtraTables)
  ? contract.adapterInitExtraTables
  : [];

if (tables.length === 0) {
  // A future adapter may stop creating optional tables. That is a valid zero-work case,
  // not a failure: the runtime proofs still run against the full certified schema.
  console.log("no adapterInitExtraTables in the schema contract; nothing to drop");
  process.exit(0);
}
if (expectedTables.length === 0) {
  throw new Error(
    "schema contract has no expectedTables; refusing to drop because the required/optional overlap cannot be verified",
  );
}
const required = new Set(expectedTables);
for (const table of tables) {
  if (!IDENTIFIER.test(table)) {
    throw new Error(`refusing unexpected table name in the schema contract: ${table}`);
  }
  if (required.has(table)) {
    throw new Error(`contract labels required table ${table} as optional; refusing to drop it`);
  }
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const host = new URL(connectionString).hostname
  .replace(/^\[|\]$/g, "")
  .replace(/\.$/, "")
  .toLowerCase();
if (!LOOPBACK_HOSTS.has(host)) {
  throw new Error(
    `Refusing to drop tables on non-loopback database host "${host}". ` +
      "This script has no remote override; point DATABASE_URL at the disposable scratch Postgres.",
  );
}

const client = new Client({ connectionString });
await client.connect();
try {
  for (const table of tables) {
    await client.query(`drop table if exists public."${table}" cascade`);
  }
  console.log(
    `dropped ${tables.length} optional Mastra tables (runtime-required tables kept): ${tables.join(", ")}`,
  );
} finally {
  await client.end();
}
