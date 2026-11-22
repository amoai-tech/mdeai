#!/usr/bin/env node
/**
 * Resolve a `listing_unavailable` log fingerprint back to an apartment.
 *
 * `POST /api/leads/schedule-viewing` logs `{ listing: { ref, shape, length } }` when the atomic
 * viewing RPC cannot resolve a listing. `ref` is HMAC-SHA256(trimmed reference) truncated to 12
 * hex characters, keyed by MDE_LOG_FINGERPRINT_KEY — deliberately not reversible by hashing
 * public slugs. This script is the other half: it recomputes that fingerprint over stored
 * apartment `id` and `slug` values with the same key and prints the matches.
 *
 * Read-only. It selects id/slug/status and writes nothing.
 *
 *   MDE_LOG_FINGERPRINT_KEY=... DATABASE_URL=... \
 *     node scripts/find-listing-by-fingerprint.mjs --ref 3f9a1c0b7d2e
 *
 * Why this reads every apartment instead of one tenant's:
 * the question being answered is "does this reference resolve to ANY apartment?", because a
 * cross-tenant or deleted id is one of the failure modes. Scoping the query to a landlord would
 * hide exactly the rows that explain the failure. An HMAC is not indexable, so the match must be
 * computed per candidate — but the scan is streamed in id order with bounded memory (see
 * `--page-size`), not loaded as one result set.
 *
 * Run it with a READ-ONLY role. `current_user` is reported, and a role that bypasses RLS is
 * called out: the scan still needs to see every row, so do not use that privilege for anything
 * beyond this read.
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

const pageSize = Number(argValue("--page-size") ?? 500);
if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 5000) {
  console.error("--page-size must be an integer between 1 and 5000");
  process.exit(1);
}

const key = process.env.MDE_LOG_FINGERPRINT_KEY?.trim();
if (!key) {
  console.error("MDE_LOG_FINGERPRINT_KEY is required: without it the route logs no `ref` at all.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required (a read-only connection is enough).");
  process.exit(1);
}

/** Must match `describeListingRef` in src/app/api/leads/schedule-viewing/route.ts. */
function fingerprint(value) {
  return createHmac("sha256", key).update(value).digest("hex").slice(0, 12);
}

/**
 * TLS policy: this script only reads, but an unverified or plaintext connection to a hosted
 * database is still a leak. Loopback (disposable/local) has no TLS to negotiate; an explicit
 * `sslmode=` in the URL is respected as the operator's deliberate choice; anything else must
 * verify the server certificate.
 *
 * Supabase presents its own CA, so "verify" means trusting the certificate bundle the app already
 * ships (`src/mastra/lib/supabase-ca.ts`, public material) rather than the system store. Reusing
 * that constant keeps one source of truth instead of copying a PEM into this script.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

let shippedCa;
try {
  ({ SUPABASE_CA_CERT: shippedCa } = await import(
    new URL("../src/mastra/lib/supabase-ca.ts", import.meta.url).href
  ));
} catch {
  // Type stripping unavailable or file moved: fall back to the system trust store.
  shippedCa = undefined;
}

function clientConfigFor(url) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    console.error("DATABASE_URL is not a parseable connection string.");
    process.exit(1);
  }
  const operatorChoseSslMode = /[?&]sslmode=/i.test(url);
  if (LOOPBACK.has(host) || operatorChoseSslMode) {
    return { connectionString: url, application_name: "find-listing-by-fingerprint" };
  }
  return {
    connectionString: url,
    application_name: "find-listing-by-fingerprint",
    ssl: shippedCa ? { ca: shippedCa, rejectUnauthorized: true } : { rejectUnauthorized: true },
  };
}

const client = new Client(clientConfigFor(connectionString));
try {
  await client.connect();
} catch (error) {
  const code = error?.code;
  if (code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "DEPTH_ZERO_SELF_SIGNED_CERT") {
    console.error(
      "TLS verification failed against this database's CA. Either pass a URL that declares its " +
        "own sslmode (e.g. ?sslmode=verify-full) or set NODE_EXTRA_CA_CERTS to the server CA PEM. " +
        "Do not disable verification: this connection reads every apartment row.",
    );
  }
  throw error;
}
try {
  const who = await client.query(
    "select current_user as role, (select rolsuper from pg_roles where rolname = current_user) as is_super",
  );
  const { role } = who.rows[0] ?? {};
  console.error(`connected as "${role}" (read-only scan of public.apartments)`);
  if (role === "postgres" || role === "service_role") {
    console.error(
      `note: "${role}" bypasses RLS. That is why this scan can see every row — use a read-only ` +
        "role for routine diagnosis and keep this connection to reads.",
    );
  }

  // Keyset pagination keeps memory bounded without truncating the search: a LIMIT would make a
  // match on a later row look like "no such apartment", which is a wrong answer, not a safe one.
  let cursor = "00000000-0000-0000-0000-000000000000";
  let scanned = 0;
  let matched = 0;
  for (;;) {
    const { rows } = await client.query(
      `select id::text as id, slug, status, listing_workflow_status
         from public.apartments
        where id > $1::uuid
        order by id
        limit $2`,
      [cursor, pageSize],
    );
    if (rows.length === 0) break;
    scanned += rows.length;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      const hitId = fingerprint(String(row.id).trim()) === ref;
      const hitSlug =
        typeof row.slug === "string" && fingerprint(row.slug.trim()) === ref;
      if (!hitId && !hitSlug) continue;
      matched += 1;
      console.log(
        `${row.id}\tslug=${row.slug ?? "(null)"}\tstatus=${row.status ?? "-"}/${row.listing_workflow_status ?? "-"}`,
      );
    }
    if (rows.length < pageSize) break;
  }

  if (matched === 0) {
    console.error(
      `no apartment matches ${ref} — the reference is stale, deleted, or not an apartment ` +
        `id/slug (scanned ${scanned} rows)`,
    );
    process.exitCode = 2;
  }
} finally {
  await client.end();
}
