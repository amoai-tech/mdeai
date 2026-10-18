/**
 * SAN-1523 — real two-connection concurrency proof for the embedding job queue.
 *
 * pgTAP runs in one transaction and cannot exercise FOR UPDATE SKIP LOCKED contention. This opens
 * independent connections: worker A claims and HOLDS its row locks, then worker B claims while A's
 * transaction is still open. B must skip A's rows, so no job is handed to two workers. A second case
 * commits A's claim, expires its lease (a crashed worker) and checks that B takes the jobs over with a
 * new lease while A's old token can no longer finish them.
 *
 * SAFETY: inserts and deletes rows, so it is fail-closed on the target host (loopback only), like
 * san1444_claim_concurrency.mjs. It can never run against production.
 *
 * Run: node supabase/tests/concurrency/san1523_embedding_claim_concurrency.mjs
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { resolveLocalDbUrl } from "../../../scripts/lib/local-db-url.mjs";

const connectionString = process.env.SUPABASE_DB_URL ?? resolveLocalDbUrl();
const parsed = new URL(connectionString);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);
if (!LOOPBACK.has(parsed.hostname)) {
  console.error(
    "REFUSING to run: " + parsed.hostname + " is not loopback. This test inserts and deletes " +
      "rows, so it must never target a remote or production database.",
  );
  process.exit(1);
}

// Unique entity ids so this run can never claim or delete another run's rows. created_at is far in the
// past so these jobs sort ahead of anything already queued in the local database.
const entityIds = Array.from({ length: 6 }, () => randomUUID());
const secondRoundIds = Array.from({ length: 2 }, () => randomUUID());
const allEntityIds = [...entityIds, ...secondRoundIds];

let failures = 0;
function check(condition, message) {
  console.log((condition ? "ok - " : "not ok - ") + message);
  if (!condition) failures += 1;
}

const seed = new Client({ connectionString });
const a = new Client({ connectionString });
const b = new Client({ connectionString });

const insertJobs = (ids) =>
  seed.query(
    "insert into public.embedding_jobs (entity_type, entity_id, content_hash, status, created_at) " +
      "select 'apartment', e, 'conc-' || e, 'pending', timestamptz '1990-01-01' from unnest($1::uuid[]) e",
    [ids],
  );

try {
  await Promise.all([seed.connect(), a.connect(), b.connect()]);

  // Round 1 — contention: A holds its locks while B claims.
  await insertJobs(entityIds);
  await a.query("begin");
  const claimedByA = await a.query("select job_id, entity_id, lease_token from public.claim_embedding_jobs(3)");
  await b.query("begin");
  const claimedByB = await b.query("select job_id, entity_id, lease_token from public.claim_embedding_jobs(3)");

  check(claimedByA.rowCount === 3, "worker A claimed 3 jobs");
  check(claimedByB.rowCount === 3, "worker B claimed the other 3 while A still holds its locks");
  const idsA = new Set(claimedByA.rows.map((row) => row.job_id));
  check(claimedByB.rows.every((row) => !idsA.has(row.job_id)), "no job is claimed by both workers");
  const claimedEntities = [...claimedByA.rows, ...claimedByB.rows].map((row) => row.entity_id).sort();
  check(
    JSON.stringify(claimedEntities) === JSON.stringify([...entityIds].sort()),
    "the claims are exactly this run's six jobs (no foreign rows touched)",
  );
  check(
    new Set([...claimedByA.rows, ...claimedByB.rows].map((row) => row.lease_token)).size === 2,
    "each worker holds its own lease token",
  );
  await a.query("rollback");
  await b.query("rollback");

  // Round 2 — a crashed worker: A claims and commits, then vanishes. Its lease runs out.
  // Round 1's rolled-back jobs are still pending and equally old, so remove them first or A could claim those.
  await seed.query("delete from public.embedding_jobs where entity_id = any($1::uuid[])", [entityIds]);
  await insertJobs(secondRoundIds);
  const first = await a.query("select job_id, lease_token, attempts from public.claim_embedding_jobs(2)");
  const heldIds = (
    await seed.query("select id from public.embedding_jobs where entity_id = any($1::uuid[]) and status = 'processing'", [
      secondRoundIds,
    ])
  ).rows.map((row) => row.id);
  check(heldIds.length === 2 && first.rowCount === 2, "A's committed claim holds both jobs");

  // rolled back, so jobs already queued in this database by someone else are left untouched
  await b.query("begin");
  const duringLease = await b.query("select job_id from public.claim_embedding_jobs(10)");
  check(
    duringLease.rows.every((row) => !heldIds.includes(row.job_id)),
    "while A's lease is alive, B cannot take its jobs",
  );
  await b.query("rollback");
  await seed.query("update public.embedding_jobs set lease_expires_at = now() - interval '1 minute' where id = any($1::uuid[])", [
    heldIds,
  ]);
  const takeover = await b.query(
    "select job_id, lease_token, attempts from public.claim_embedding_jobs(2)", // ours are the oldest rows
  );
  check(takeover.rows.every((row) => heldIds.includes(row.job_id)), "the takeover is exactly A's two jobs");
  check(takeover.rowCount === 2, "after A's lease expires, B takes both jobs over");
  check(takeover.rows.every((row) => row.attempts === 2), "and the takeover counts as the second attempt");

  const oldToken = first.rows[0].lease_token;
  const lateFinish = await a.query(
    "select public.complete_embedding_job($1::uuid, $2::uuid, array_fill(0.01::float8, array[768])) as outcome",
    [first.rows[0].job_id, oldToken],
  );
  check(lateFinish.rows[0].outcome === "lost_lease", "A, waking up late, cannot finish a job B now owns");
} catch (error) {
  console.error("concurrency test error:", error instanceof Error ? error.message : error);
  failures += 1;
} finally {
  await seed.query("delete from public.embedding_jobs where entity_id = any($1::uuid[])", [allEntityIds]).catch(() => {});
  await Promise.allSettled([seed.end(), a.end(), b.end()]);
}

console.log(failures === 0 ? "PASS — embedding claim concurrency safe" : "FAIL — " + failures + " check(s) failed");
process.exit(failures === 0 ? 0 : 1);
