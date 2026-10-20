#!/usr/bin/env node
/**
 * Release gate: every migration committed at the deployed revision must already be applied.
 *
 * WHY THIS EXISTS
 * Three merged migrations never reached production (20261018102300, 20261020120000 +
 * 20261020130000, 20261021000000). The Next.js deploy is automatic, the database step is a
 * deliberate operator command (npm run push:migration), and nothing checked that it happened.
 *
 * WHY IT HAS NO IMPORTS
 * This runs from `.trusted/`, a separate checkout of main that has no node_modules. A package
 * import (for example @supabase/supabase-js) cannot resolve there, so the gate would fail on every
 * run and block every release. Node 18+ has fetch, so the whole check is stdlib-only.
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

/**
 * The base URL is configuration, not user input — but a release step holding a service-role key must
 * never issue a request to an arbitrary host. A mistyped or tampered value would send the key (and
 * the request) to an internal address such as 169.254.169.254 or localhost.
 *
 * Accept only https to a Supabase project host, or to one explicitly named for self-hosted setups.
 */
export function trustedSupabaseOrigin(raw, selfHosted = process.env.MDEAI_TRUSTED_SUPABASE_HOST) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use https");
  }
  const isSupabaseHost = /\.supabase\.(co|in)$/i.test(url.hostname);
  const isDeclaredHost = Boolean(selfHosted) && url.hostname === selfHosted;
  if (!isSupabaseHost && !isDeclaredHost) {
    throw new Error(
      "refusing to send the service key to " +
        url.hostname +
        " — expected a *.supabase.co host or MDEAI_TRUSTED_SUPABASE_HOST",
    );
  }
  return url.origin;
}

/** Read the applied versions through PostgREST, with no client library. */
async function fetchAppliedVersions(url, key) {
  const response = await fetch(trustedSupabaseOrigin(url) + "/rest/v1/rpc/applied_migration_versions", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error("HTTP " + response.status + " from the ledger RPC: " + detail);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
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

  let applied;
  try {
    applied = await fetchAppliedVersions(url, key);
  } catch (error) {
    console.error(
      "verify-migrations: could not read the production migration ledger: " +
        (error && error.message ? error.message : String(error)),
    );
    console.error(
      "verify-migrations: if public.applied_migration_versions() is missing, apply " +
        "20261021010000_san1281_applied_migration_versions.sql, then run " +
        "`notify pgrst, 'reload schema'` — PostgREST caches function signatures.",
    );
    process.exit(2);
  }

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