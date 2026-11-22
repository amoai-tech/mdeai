#!/usr/bin/env node
/**
 * Resolve a `listing_unavailable` log fingerprint back to an apartment.
 *
 * `POST /api/leads/schedule-viewing` logs `{ listing: { ref, shape, length } }` when the atomic
 * viewing RPC cannot resolve a listing. `ref` is HMAC-SHA256(trimmed reference) truncated to 12
 * hex characters, keyed by MDE_LOG_FINGERPRINT_KEY — deliberately not reversible by hashing
 * public slugs. This script is the other half: it recomputes that fingerprint over every stored
 * apartment `id` and `slug` with the same key and prints the matches.
 *
 * Read-only. It selects id/slug/status and writes nothing.
 *
 *   MDE_LOG_FINGERPRINT_KEY=... DATABASE_URL=... \
 *     node scripts/find-listing-by-fingerprint.mjs --ref 3f9a1c0b7d2e
 *
 * Exit codes: 0 = matched, 2 = no match (stale/deleted reference), 1 = misconfigured.
 */
import { createHmac } from "node:crypto";
import { Client } from "pg";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const ref = argValue("--ref")?.trim().toLowerCase();
if (!ref || !/^[0-9a-f]{12}$/.test(ref)) {
  console.error("usage: --ref <12 hex chars> (the `listing.ref` value from the server log)");
  process.exit(1);
}

const key = process.env.MDE_LOG_FINGERPRINT_KEY?.trim();
if (!key) {
  console.error(
    "MDE_LOG_FINGERPRINT_KEY is required: without it the route logs no `ref` at all.",
  );
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required (read-only connection is enough).");
  process.exit(1);
}

/** Must match `describeListingRef` in src/app/api/leads/schedule-viewing/route.ts. */
function fingerprint(value) {
  return createHmac("sha256", key).update(value).digest("hex").slice(0, 12);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query(
    "select id::text as id, slug, status, listing_workflow_status from public.apartments",
  );
  const matches = rows.filter(
    (row) =>
      fingerprint(String(row.id).trim()) === ref ||
      (typeof row.slug === "string" && fingerprint(row.slug.trim()) === ref),
  );

  if (matches.length === 0) {
    console.error(
      `no apartment matches ${ref} — the reference is stale, deleted, or not an apartment id/slug ` +
        `(searched ${rows.length} rows)`,
    );
    process.exitCode = 2;
  } else {
    for (const row of matches) {
      console.log(
        `${row.id}\tslug=${row.slug ?? "(null)"}\tstatus=${row.status ?? "-"}/${row.listing_workflow_status ?? "-"}`,
      );
    }
  }
} finally {
  await client.end();
}
