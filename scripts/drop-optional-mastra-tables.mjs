#!/usr/bin/env node
/**
 * SAN-1311 — drop the optional `adapterInitExtraTables` from a scratch database so the
 * runtime proofs can show the upgraded runtime does not require them.
 *
 * Used only by the disposable `mastra-schema-init` Postgres in
 * `.github/workflows/floor.yml`. Refuses a non-loopback host (unless
 * MASTRA_ALLOW_REMOTE_INTEGRATION=1) and validates every identifier against the contract
 * before it reaches SQL, so a corrupted contract cannot drop an arbitrary relation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

/**
 * Hosts that can only ever be the local machine. Read from the same source of truth as the
 * TypeScript guard so the two enforcement paths cannot drift. `::` is the IPv6
 * *unspecified* address, NOT loopback, so the shared list deliberately excludes it.
 */
const LOOPBACK_HOSTS = new Set(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../src/mastra/lib/integration-loopback-hosts.json", import.meta.url),
      ),
      "utf8",
    ),
  ),
);
const OPT_IN = "MASTRA_ALLOW_REMOTE_INTEGRATION";
const IDENTIFIER = /^mastra_[a-z0-9_]+$/;

const contract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./mastra-schema-contract.json", import.meta.url)),
    "utf8",
  ),
);
const tables = Array.isArray(contract.adapterInitExtraTables)
  ? contract.adapterInitExtraTables
  : [];

for (const table of tables) {
  if (!IDENTIFIER.test(table)) {
    throw new Error(`refusing unexpected table name in the schema contract: ${table}`);
  }
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const host = new URL(connectionString).hostname
  .replace(/^\[|\]$/g, "")
  .replace(/\.$/, "")
  .toLowerCase();
if (!LOOPBACK_HOSTS.has(host) && process.env[OPT_IN] !== "1") {
  throw new Error(
    `Refusing to drop tables on non-loopback database host "${host}". ` +
      `Point DATABASE_URL at a scratch Postgres, or set ${OPT_IN}=1 if deliberate.`,
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
