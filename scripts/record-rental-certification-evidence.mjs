#!/usr/bin/env node
/**
 * SAN-468 §5.4 — record REAL rental certification evidence against the existing model.
 *
 * Operator-run and deliberately explicit: it refuses to write without
 * `--confirm-write=true`, requires the actual check timestamp, and never invents a
 * fact. It writes only:
 *   * public.rental_freshness_log   — one row per (listing_id, checked_at)
 *   * public.apartments             — last_checked_at + freshness_status (+ an
 *                                     authorized image URL, appended, when supplied)
 *   * public.rental_grounding       — optional source grounding
 *   * public.property_verifications — optional property verification
 *
 * Every insert is existence-guarded, so re-running is a no-op.
 *
 * Usage:
 *   node --env-file=.env.local scripts/record-rental-certification-evidence.mjs \
 *     --apartment-id=<uuid> --checked-at=<iso> --freshness-status=active \
 *     --confirm-write=true [--image-url=…] [--source-type=… --source-url=…] \
 *     [--verification-status=… --verified-by=<uuid> --notes=…]
 */
import pg from "pg";
import { parseCertificationEvidenceArgs } from "./lib/certification-evidence-args.mjs";

const argv = process.argv.slice(2);
const dbArg = argv.find((a) => a.startsWith("--database-url="));
const parsed = parseCertificationEvidenceArgs(argv);
if (!parsed.ok) {
  console.error("Refusing to write — fix these first:");
  for (const error of parsed.errors) console.error(`  ✗ ${error}`);
  process.exit(2);
}

const v = parsed.value;
const dbUrl =
  (dbArg ? dbArg.slice("--database-url=".length) : null) ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No database URL: pass --database-url= or set SUPABASE_DB_URL.");
  process.exit(2);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "unparseable-host";
  }
}

// Supabase requires TLS for non-loopback connections. Honour an explicit `sslmode`
// in the URL; otherwise default to require-equivalent TLS (encrypt, no CA pin,
// matching Supabase's `sslmode=require`) so evidence never travels in plaintext.
function isLoopbackHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
const parsedDb = (() => {
  try {
    return new URL(dbUrl);
  } catch {
    return null;
  }
})();
// ponytail: TLS here is encryption-only (require-equivalent). Full certificate
// verification (verify-full) fails against the Supabase pooler with "self-signed
// certificate in certificate chain"; the upgrade path is to pin the Supabase CA and
// set rejectUnauthorized: true once that certificate is available.
const needsTls =
  parsedDb !== null && !isLoopbackHost(parsedDb.hostname) && !/[?&]sslmode=/.test(dbUrl);
const client = new pg.Client(
  needsTls
    ? { connectionString: dbUrl, ssl: { rejectUnauthorized: false } }
    : { connectionString: dbUrl },
);
await client.connect();
let failed = false;
let inTransaction = false;
try {
  const {
    rows: [apartment],
  } = await client.query(
    `select id, title, status, moderation_status, listing_workflow_status,
            freshness_status, last_checked_at,
            coalesce(array_length(images, 1), 0) as image_count, metadata
       from public.apartments where id = $1`,
    [v.apartmentId],
  );
  if (!apartment) throw new Error(`apartment ${v.apartmentId} not found`);
  const isFixture =
    apartment.metadata?.is_test_fixture === true || apartment.metadata?.is_test_fixture === "true";
  if (isFixture) {
    throw new Error("refusing to record certification evidence for an is_test_fixture row");
  }

  console.log(`Target: ${hostOf(dbUrl)} · ${apartment.title}`);
  console.log(
    `Before: ${apartment.status}/${apartment.moderation_status}/${apartment.listing_workflow_status} · freshness=${apartment.freshness_status} · last_checked_at=${apartment.last_checked_at?.toISOString?.() ?? "null"} · images=${apartment.image_count}`,
  );

  await client.query("begin");
  inTransaction = true;

  // Same (listing, checked_at): an identical status is a no-op; a different status is
  // a conflict, never a silent overwrite and never a silent ignore.
  const { rows: priorFreshness } = await client.query(
    `select status from public.rental_freshness_log
      where listing_id = $1::uuid and checked_at = $2::timestamptz
      limit 1`,
    [v.apartmentId, v.checkedAt],
  );
  let freshnessRows = 0;
  if (priorFreshness.length === 0) {
    const freshness = await client.query(
      `insert into public.rental_freshness_log (listing_id, checked_at, status)
       values ($1::uuid, $2::timestamptz, $3)
       returning id`,
      [v.apartmentId, v.checkedAt, v.freshnessStatus],
    );
    freshnessRows = freshness.rowCount ?? 0;
  } else if (priorFreshness[0].status !== v.freshnessStatus) {
    throw new Error(
      `rental_freshness_log already records "${priorFreshness[0].status}" at this checked_at; refusing to record "${v.freshnessStatus}" for the same timestamp. Record the change under a new --checked-at.`,
    );
  }

  // Mirror the apartment only when the (listing, checked_at) evidence row was new,
  // so re-running the same evidence is a true no-op.
  if (freshnessRows > 0) {
    await client.query(
      `update public.apartments
          set freshness_status = $2, last_checked_at = $3::timestamptz
        where id = $1::uuid`,
      [v.apartmentId, v.freshnessStatus, v.checkedAt],
    );
  }

  let grounding = 0;
  if (v.sourceType && v.sourceUrl) {
    const g = await client.query(
      `insert into public.rental_grounding (apartment_id, source_type, source_url, checked_at)
       select $1::uuid, $2, $3, $4::timestamptz
        where not exists (
          select 1 from public.rental_grounding
           where apartment_id = $1::uuid and source_type = $2
             and source_url = $3 and checked_at = $4::timestamptz)
       returning id`,
      [v.apartmentId, v.sourceType, v.sourceUrl, v.checkedAt],
    );
    grounding = g.rowCount ?? 0;
  }

  let verification = 0;
  if (v.verificationStatus) {
    if (!v.verifiedBy) {
      throw new Error("--verified-by is required with --verification-status");
    }
    // property_verifications is UNIQUE(apartment_id): one verification per listing.
    // Identical evidence is a no-op; different evidence must be an explicit update,
    // never a silent skip that leaves a stale status behind.
    const { rows: priorVerification } = await client.query(
      `select status, verified_by, notes from public.property_verifications
        where apartment_id = $1::uuid limit 1`,
      [v.apartmentId],
    );
    if (priorVerification.length === 0) {
      const pv = await client.query(
        `insert into public.property_verifications (apartment_id, verified_by, status, notes, verified_at)
         values ($1::uuid, $2::uuid, $3, $4, $5::timestamptz)
         returning id`,
        [v.apartmentId, v.verifiedBy, v.verificationStatus, v.notes, v.checkedAt],
      );
      verification = pv.rowCount ?? 0;
    } else {
      const prior = priorVerification[0];
      const identical =
        prior.status === v.verificationStatus &&
        prior.verified_by === v.verifiedBy &&
        (prior.notes ?? "") === (v.notes ?? "");
      if (!identical) {
        throw new Error(
          `apartment already has a "${prior.status}" verification; refusing to overwrite it with "${v.verificationStatus}". Use an explicit update workflow.`,
        );
      }
    }
  }

  let imageAdded = 0;
  if (v.imageUrl) {
    const img = await client.query(
      `update public.apartments
          set images = array_append(coalesce(images, '{}'::text[]), $2)
        where id = $1::uuid and not ($2 = any(coalesce(images, '{}'::text[])))
       returning id`,
      [v.apartmentId, v.imageUrl],
    );
    imageAdded = img.rowCount ?? 0;
  }

  await client.query("commit");
  inTransaction = false;

  const {
    rows: [after],
  } = await client.query(
    `select freshness_status, last_checked_at,
            coalesce(array_length(images, 1), 0) as image_count,
            (select count(*)::int from public.rental_freshness_log where listing_id = $1::uuid) as freshness_rows,
            (select count(*)::int from public.rental_grounding where apartment_id = $1::uuid) as grounding_rows,
            (select count(*)::int from public.property_verifications where apartment_id = $1::uuid) as verification_rows
       from public.apartments where id = $1::uuid`,
    [v.apartmentId],
  );

  console.log(
    `Wrote: freshness_log+${freshnessRows} grounding+${grounding} verification+${verification} image+${imageAdded}`,
  );
  console.log(
    `After: freshness=${after.freshness_status} · last_checked_at=${after.last_checked_at?.toISOString?.() ?? after.last_checked_at ?? "null"} · images=${after.image_count} · freshness_rows=${after.freshness_rows} grounding_rows=${after.grounding_rows} verification_rows=${after.verification_rows}`,
  );
} catch (err) {
  if (inTransaction) {
    try {
      await client.query("rollback");
    } catch {
      /* the transaction may already be closed */
    }
  }
  console.error(`FAIL: ${err instanceof Error ? err.message : err}`);
  failed = true;
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
