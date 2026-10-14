/**
 * SAN-1444 — real two-connection concurrency proof for the WhatsApp inbound claim.
 *
 * pgTAP runs in one transaction and cannot exercise SKIP LOCKED contention. This opens two
 * independent connections: worker A claims and HOLDS its row locks, then worker B claims while
 * A's transaction is still open. B must skip A's locked rows, so no row is claimed twice.
 *
 * Run: SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres node supabase/tests/concurrency/san1444_claim_concurrency.mjs
 */
import { Client } from "pg";

const connectionString =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres";

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

  // Seed must be COMMITTED so the independent worker connections can see it.
  for (let i = 0; i < 4; i += 1) {
    await seed.query(
      "insert into public.whatsapp_messages (phone_number, direction, content, sender, external_id, processing_status, attempts, next_attempt_at) " +
        "values ('57300', 'inbound', 'c', 'user', $1, 'pending', 0, now()) " +
        "on conflict (external_id) where external_id is not null do nothing",
      ["t-conc-" + i],
    );
  }

  await a.query("begin");
  const claimedByA = await a.query(
    "select id, external_id, claim_token from public.whatsapp_claim_inbound('conc-a', 2, 180, 5)",
  );

  await b.query("begin");
  const claimedByB = await b.query(
    "select id, external_id, claim_token from public.whatsapp_claim_inbound('conc-b', 2, 180, 5)",
  );

  check(claimedByA.rowCount === 2, "worker A claimed 2 rows");
  check(claimedByB.rowCount === 2, "worker B claimed the other 2 while A still holds its locks");

  const idsA = new Set(claimedByA.rows.map((row) => row.id));
  const overlap = claimedByB.rows.filter((row) => idsA.has(row.id));
  check(overlap.length === 0, "no row is claimed by both workers");

  const tokens = new Set([...claimedByA.rows, ...claimedByB.rows].map((row) => row.claim_token));
  check(tokens.size === 4, "each claim gets its own fencing token");

  await a.query("rollback");
  await b.query("rollback");
} catch (error) {
  console.error("concurrency test error:", error instanceof Error ? error.message : error);
  failures += 1;
} finally {
  await seed.query("delete from public.whatsapp_messages where external_id like 't-conc-%'").catch(() => {});
  await Promise.allSettled([seed.end(), a.end(), b.end()]);
}

console.log(failures === 0 ? "PASS — claim concurrency safe" : "FAIL — " + failures + " check(s) failed");
process.exit(failures === 0 ? 0 : 1);
