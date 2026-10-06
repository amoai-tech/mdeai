#!/usr/bin/env node
/**
 * SAN-1368 — make a disposable Postgres look like Supabase for the storage-lockdown proof.
 *
 * The lockdown targets the Supabase roles `anon`, `authenticated` and `service_role`, and
 * revokes the table privileges Supabase's default grants give them. The `mastra-schema-init`
 * CI job runs a plain `postgres:17` with none of those roles, so the policy and grant
 * assertions in `verify-mastra-schema-init.mjs` would be skipped and the required check would
 * prove only half the invariant. Run this BEFORE `npm run mastra:init`.
 *
 * This refuses a non-loopback DATABASE_URL — it is a disposable-database helper and must never
 * touch a real environment.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const LOOPBACK_HOSTS = new Set(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../src/mastra/lib/integration-loopback-hosts.json", import.meta.url)),
      "utf8",
    ),
  ),
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const host = new URL(connectionString).hostname
  .replace(/^\[|\]$/g, "")
  .replace(/\.$/, "")
  .toLowerCase();
if (!LOOPBACK_HOSTS.has(host)) {
  throw new Error(
    `Refusing to seed Supabase roles on non-loopback database host "${host}". This helper is for the disposable CI database only.`,
  );
}

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$;
  `);
  await client.query("GRANT USAGE ON SCHEMA public TO anon, authenticated");
  await client.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated",
  );
  console.log(
    "seed-supabase-proof-roles: anon/authenticated/service_role present with permissive default grants",
  );
} finally {
  await client.end().catch(() => undefined);
}
