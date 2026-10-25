/**
 * SAN-1444 — real two-connection concurrency proof for the WhatsApp inbound claim.
 *
 * pgTAP runs in one transaction and cannot exercise SKIP LOCKED contention. This opens two
 * independent connections: worker A claims and HOLDS its row locks, then worker B claims while
 * A's transaction is still open. B must skip A's locked rows, so no row is claimed twice.
 *
 * SAFETY: this test inserts and deletes rows, so it is fail-closed on the target host. It reuses
 * the repository's local-URL resolver and refuses anything that is not loopback, mirroring
 * scripts/verify-san1106-postgrest-role.mjs. It can never run against production.
 *
 * Run: node supabase/tests/concurrency/san1444_claim_concurrency.mjs
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

// Unique per-run ids so the test can never claim or delete another run's rows.
const runId = "t-conc-" + randomUUID();
const seededIds = [0, 1, 2, 3].map((i) => runId + "-" + i);

let failures = 0;
function check(condition, message) {
  console.log((condition ? "ok - " : "not ok - ") + message);
  if (!condition) failures += 1;
}

const seed = new Client({ connectionString });
const a = new Client({ connectionString });
const b = new Client({ connectionString });

try {
  await Promise.all([seed.connect(), a.connect(), b.connect()]);

  for (const externalId of seededIds) {
    await seed.query(
      "insert into public.whatsapp_messages (phone_number, direction, content, sender, external_id, processing_status, attempts, next_attempt_at) " +
        "values ('57300', 'inbound', 'c', 'user', $1, 'pending', 0, now() - interval '1 hour')",
      [externalId],
    );
  }

  await a.query("begin");
  const claimedByA = await a.query(
    "select id, external_id, claim_token, claimed_by from public.whatsapp_claim_inbound('conc-a', 2, 180, 5)",
  );

  await b.query("begin");
  const claimedByB = await b.query(
    "select id, external_id, claim_token, claimed_by from public.whatsapp_claim_inbound('conc-b', 2, 180, 5)",
  );

  const all = [...claimedByA.rows, ...claimedByB.rows];
  const claimedExternalIds = all.map((row) => row.external_id).sort();

  check(claimedByA.rowCount === 2, "worker A claimed 2 rows");
  check(claimedByB.rowCount === 2, "worker B claimed the other 2 while A still holds its locks");

  const idsA = new Set(claimedByA.rows.map((row) => row.id));
  check(
    claimedByB.rows.filter((row) => idsA.has(row.id)).length === 0,
    "no row is claimed by both workers",
  );
  check(
    JSON.stringify(claimedExternalIds) === JSON.stringify([...seededIds].sort()),
    "the claims are exactly this run's four seeded rows (no foreign rows touched)",
  );
  check(new Set(all.map((row) => row.claim_token)).size === 4, "each claim gets its own fencing token");
  check(
    all.every((row) => row.claimed_by === "conc-a" || row.claimed_by === "conc-b"),
    "each row records its owning worker",
  );

  await a.query("rollback");
  await b.query("rollback");
} catch (error) {
  console.error("concurrency test error:", error instanceof Error ? error.message : error);
  failures += 1;
} finally {
  await seed
    .query("delete from public.whatsapp_messages where external_id = any($1::text[])", [seededIds])
    .catch(() => {});
  await Promise.allSettled([seed.end(), a.end(), b.end()]);
}

console.log(failures === 0 ? "PASS — claim concurrency safe" : "FAIL — " + failures + " check(s) failed");
process.exit(failures === 0 ? 0 : 1);
