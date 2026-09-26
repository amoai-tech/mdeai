#!/usr/bin/env node
/**
 * Initialize the Mastra Postgres schema (`mastra_*` tables) for ONE environment.
 *
 * Why this script exists
 * ----------------------
 * `createMastraStorage` constructs `PostgresStore` with `disableInit: true`. That is
 * correct for Vercel serverless — it skips a schema check on every cold start — but it
 * also means the runtime will NEVER create its own tables. If the schema is missing, the
 * first agent request fails deep inside a Mastra query instead of with a clear error.
 *
 * No `supabase/migrations/**` file creates these tables: they are vendor-owned Mastra
 * objects, not MDE application schema. Production already has them (32 `mastra_*` tables)
 * because it was initialized once. A NEW environment — a fresh Supabase project, a local
 * stack, a restore — has none, so initialization has to be an explicit, documented step.
 *
 * Usage
 * -----
 *   npm run mastra:init                 # uses DATABASE_URL (or --env-file .env.local)
 *   DATABASE_URL=postgres://… node scripts/init-mastra-schema.mjs
 *
 * Safe to re-run: Mastra's `init()` is idempotent and only creates what is missing.
 * It never drops or alters data, so it is safe against production.
 */
import { PostgresStore } from "@mastra/pg";
import { applyThreadOwnershipGuardTo } from "./lib/mastra-thread-ownership-guard.mjs";

const connectionString = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "").trim();

if (!connectionString) {
  console.error(
    "init-mastra-schema: DATABASE_URL is required (and must not be blank).\n" +
      "  local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<db port>/postgres\n" +
      "  remote: set DATABASE_URL, or run `node --env-file=.env.local scripts/init-mastra-schema.mjs`",
  );
  process.exit(1);
}

/** Report the connected host without leaking the password. */
function safeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

const store = new PostgresStore({ id: "mastra-schema-init", connectionString });

try {
  console.log(`init-mastra-schema: initializing Mastra schema on ${safeTarget(connectionString)}`);
  await store.init();

  // SAN-547 — a thread's owner is immutable once claimed. Applied here rather than in
  // `supabase/migrations/**` because this script is what creates the vendor-owned
  // `mastra_*` tables; a fresh `supabase db reset` has no `mastra_threads` to guard.
  await applyThreadOwnershipGuardTo(connectionString);
  console.log("init-mastra-schema: ok — Mastra schema present, thread ownership guard applied");
} catch (error) {
  console.error(
    `init-mastra-schema: FAILED — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await store.close();
}
