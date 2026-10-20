#!/usr/bin/env node
/**
 * Release gate: every migration committed at the deployed revision must already be applied.
 *
 * WHY THIS EXISTS
 * Three merged migrations never reached production (20261018102300, 20261020120000 +
 * 20261020130000, 20261021000000). The Next.js deploy is automatic, the database step is a
 * deliberate operator command (npm run push:migration), and nothing checked that it happened.
 * A release could therefore promote code that expected a schema production did not have.
 *
 * WHAT IT DOES NOT DO
 * It never applies, repairs, resets or drops anything. It reads the ledger and refuses to let a
 * release be promoted when the schema is behind. Applying stays a reviewed human decision.
 *
 * EXIT CODES
 *   0  every committed migration is applied
 *   1  at least one is missing (the list is printed)
 *   2  the check could not run at all (missing env, unreachable API, missing RPC)
 *
 * A gate that cannot run must fail, never pass by default.
 */

import { readdirSync } from "node:fs";

const MIGRATION_FILE = /^(\d+)_[^/]+\.sql$/;

/** Version strings of the migrations committed in dir, sorted. */
export function localVersions(dir = "supabase/migrations") {
  return readdirSync(dir)
    .filter((name) => MIGRATION_FILE.test(name))
    .map((name) => name.match(MIGRATION_FILE)[1])
    .sort();
}

/** Versions present locally but absent from the applied set. */
export function missingVersions(local, applied) {
  const have = new Set(applied.map(String));
  return local.filter((version) => !have.has(String(version)));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error(
      "verify-migrations: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
    process.exit(2);
  }

  const local = localVersions();
  if (local.length === 0) {
    console.error("verify-migrations: no migrations found — refusing to report success.");
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.rpc("applied_migration_versions");

  if (error) {
    console.error(
      "verify-migrations: could not read the production migration ledger: " + error.message,
    );
    console.error(
      "verify-migrations: if public.applied_migration_versions() is missing, apply " +
        "20261021010000_san1281_applied_migration_versions.sql, then run " +
        "`notify pgrst, 'reload schema'` — PostgREST caches function signatures.",
    );
    process.exit(2);
  }

  const applied = Array.isArray(data) ? data : [];
  const missing = missingVersions(local, applied);

  if (missing.length === 0) {
    console.log(
      "verify-migrations: OK — all " + local.length + " committed migrations are applied.",
    );
    return;
  }

  console.error(
    "verify-migrations: " +
      missing.length +
      " committed migration(s) are NOT applied to production:",
  );
  for (const version of missing) console.error("  - " + version);
  console.error(
    "Run `npm run push:migration` with the reviewed manifest, then re-run this release.",
  );
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("verify-production-migrations.mjs")) {
  main().catch((error) => {
    console.error("verify-migrations: " + (error && error.message ? error.message : String(error)));
    process.exit(2);
  });
}