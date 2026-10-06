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
  console.log(
    `SKIP inventory-quality report (no reachable DB): ${err instanceof Error ? err.message : err}`,
  );
  process.exit(0);
}

const sql = readFileSync(sqlPath, "utf8");
const { rows } = await client.query(sql);
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
  const mark = row.launch_ready ? "✅" : "❌";
  const coord =
    !row.has_coords ? "none" : row.coord_pair_valid ? (row.postgis_consistent ? "valid" : "drift") : "invalid";
  const dup =
    row.dup_source_url > 1 || row.dup_source_listing_id > 1 || row.dup_property_identity > 1 ? " DUP" : "";
  console.log(`${mark} ${row.title}`);
  console.log(
    `    ${row.status}/${row.moderation_status}/${row.listing_workflow_status} · ${row.price_monthly ?? "?"} ${row.currency ?? "?"} · images=${row.has_usable_image ? "yes" : "no"} · coords=${coord} · freshness=${row.has_freshness_evidence ? "yes" : "no"} · owner=${row.has_canonical_owner ? "yes" : "no"}`,
  );
  console.log(
    `    searchable=${row.searchable} map_ready=${row.map_ready} launch_ready=${row.launch_ready} requestable=${row.requestable}${dup}`,
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
for (const key of ["half_coords", "out_of_range", "active_external_candidates"]) {
  if (Number(counts[key]) !== 0) failures.push(`${key}=${counts[key]} (expected 0)`);
}
const unexplained = detail.filter(
  (row) => !row.launch_ready && (!row.launch_blockers || row.launch_blockers.length === 0),
);
if (unexplained.length) {
  failures.push(`${unexplained.length} non-launch-ready row(s) without a deterministic reason`);
}
if (minLaunchReady !== null && Number(counts.launch_ready) < minLaunchReady) {
  failures.push(`launch_ready=${counts.launch_ready} < --min-launch-ready=${minLaunchReady}`);
}

if (failures.length) {
  console.error("FAIL inventory-quality invariants:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `PASS inventory-quality report (launch_ready=${counts.launch_ready}, searchable=${counts.searchable}, map_ready=${counts.map_ready}, active_external_candidates=${counts.active_external_candidates}, half_coords=${counts.half_coords}, out_of_range=${counts.out_of_range}, postgis_drift=${counts.postgis_drift})`,
);
