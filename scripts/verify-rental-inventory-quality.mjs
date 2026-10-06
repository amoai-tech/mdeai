#!/usr/bin/env node
/**
 * SAN-468 · REAL-002 — production rental inventory-quality report (read only).
 *
 * Runs scripts/sql/san468-inventory-quality-report.sql and prints one line per
 * apartment plus aggregate counts. Fails only on always-wrong integrity states
 * (half coordinates, out-of-range coordinates, PostGIS drift, accidentally active
 * external candidates) or an unexplained row. Launch-ready count is reported; add
 * --min-launch-ready=N to assert it during certification.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-rental-inventory-quality.mjs
 *   node --env-file=.env.local scripts/verify-rental-inventory-quality.mjs --min-launch-ready=3
 *   node scripts/verify-rental-inventory-quality.mjs --database-url=...
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "sql/san468-inventory-quality-report.sql");

const args = process.argv.slice(2);
const dbArg = args.find((a) => a.startsWith("--database-url="));
const minArg = args.find((a) => a.startsWith("--min-launch-ready="));
const minLaunchReady = minArg ? Number(minArg.split("=")[1]) : null;
const dbUrl =
  (dbArg ? dbArg.slice("--database-url=".length) : null) ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL;

if (!dbUrl) {
  console.log("SKIP inventory-quality report (no SUPABASE_DB_URL / DATABASE_URL)");
  process.exit(0);
}
if (minLaunchReady !== null && !Number.isInteger(minLaunchReady)) {
  console.error("--min-launch-ready must be an integer");
  process.exit(2);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "unparseable-host";
  }
}

const client = new pg.Client({ connectionString: dbUrl });
try {
  await client.connect();
} catch (err) {
  // A configured database that is unreachable must FAIL, not skip: this runner is
  // used as an explicit certification gate. Only the no-URL branch above is a
  // legitimate skip.
  console.error(
    `FAIL inventory-quality report (configured DB is unreachable): ${err instanceof Error ? err.message : err}`,
  );
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
let rows;
try {
  ({ rows } = await client.query(sql));
} catch (err) {
  // A failing query (syntax, permission, schema drift) must produce a clean FAIL
  // and release the connection rather than an unhandled rejection.
  console.error(
    `FAIL inventory-quality report (query failed): ${err instanceof Error ? err.message : err}`,
  );
  await client.end().catch(() => {});
  process.exit(1);
}
await client.end();

const report = rows[0]?.report;
if (!report || !Array.isArray(report.rows) || !report.counts) {
  console.error("FAIL inventory-quality report returned no parseable data");
  process.exit(1);
}
const detail = report.rows;
const counts = report.counts;

console.log(`Inventory-quality report — ${hostOf(dbUrl)}`);
console.log("");
for (const row of detail) {
  const mark = row.is_canonical_launch_ready ? "✅" : row.launch_ready ? "➡️" : "❌";
  const coord =
    !row.has_coords ? "none" : row.coord_pair_valid ? (row.postgis_consistent ? "valid" : "drift") : "invalid";
  const dup =
    row.dup_source_url > 1 || row.dup_source_listing_id > 1 || row.dup_property_identity > 1 ? " DUP" : "";
  console.log(`${mark} ${row.title}`);
  console.log(
    `    ${row.status}/${row.moderation_status}/${row.listing_workflow_status} · ${row.price_monthly ?? "?"} ${row.currency ?? "?"} · image=${row.has_authorized_photo ? "authorized" : row.has_any_image ? "rights-unverified" : "none"} · coords=${coord} · freshness=${row.has_current_freshness ? "current" : "missing/stale"} · owner=${row.has_verified_owner ? "verified" : row.has_canonical_owner ? "unverified" : "none"} · property=${row.has_verified_property ? "verified" : "none"}`,
  );
  console.log(
    `    public=${row.publicly_eligible} searchable=${row.searchable} map_ready=${row.map_ready} launch_ready=${row.launch_ready} canonical=${row.is_canonical_launch_ready} requestable=${row.requestable}${dup}`,
  );
  console.log(
    `    why: ${row.launch_ready ? "launch-ready" : (row.launch_blockers ?? []).join(", ")}`,
  );
}
console.log("");
console.log("Aggregates:");
console.log(JSON.stringify(counts, null, 2));
console.log("");

const failures = [];
// postgis_drift is reported but not fatal: SAN-468 §2.2 backfills the drifted row only if
// its coordinates are trusted, and launch_ready itself requires postgis_consistent, so a
// launch-ready drift can never occur. half/out-of-range pairs and active external
// candidates are always wrong.
// A rental that is publicly visible or launch-ready must never carry inconsistent
// PostGIS data. These are always-zero invariants, not warnings.
for (const key of [
  "half_coords",
  "out_of_range",
  "active_external_candidates",
  "publicly_eligible_with_drift",
  "launch_ready_with_drift",
]) {
  if (Number(counts[key]) !== 0) failures.push(`${key}=${counts[key]} (expected 0)`);
}
const unexplained = detail.filter(
  (row) => !row.launch_ready && (!row.launch_blockers || row.launch_blockers.length === 0),
);
if (unexplained.length) {
  failures.push(`${unexplained.length} non-launch-ready row(s) without a deterministic reason`);
}
// The gate counts DISTINCT canonical physical properties, never rows. Two database
// rows for the same address must not satisfy a >= 3 launch requirement.
if (minLaunchReady !== null && Number(counts.launch_ready_distinct) < minLaunchReady) {
  failures.push(
    `launch_ready_distinct=${counts.launch_ready_distinct} < --min-launch-ready=${minLaunchReady}`,
  );
}
if (Number(counts.duplicate_launch_ready_rows) > 0) {
  console.warn(
    `WARN duplicate launch-ready rows collapsed by canonical identity: ${counts.duplicate_launch_ready_rows}`,
  );
}

if (failures.length) {
  console.error("FAIL inventory-quality invariants:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `PASS inventory-quality report (launch_ready=${counts.launch_ready}, launch_ready_distinct=${counts.launch_ready_distinct}, duplicate_launch_ready_rows=${counts.duplicate_launch_ready_rows}, searchable=${counts.searchable}, map_ready=${counts.map_ready}, active_external_candidates=${counts.active_external_candidates}, half_coords=${counts.half_coords}, out_of_range=${counts.out_of_range}, postgis_drift=${counts.postgis_drift})`,
);
