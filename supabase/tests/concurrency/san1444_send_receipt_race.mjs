/**
 * SAN-1444 — send vs delivery-receipt race, on two real connections.
 *
 * The send RPC records an outbound wamid while a Meta delivery callback for the SAME wamid can
 * arrive at the same moment. This proves the atomic upsert cannot trip the unique index and that
 * the ownership/linkage survives.
 *
 * SAFETY: inserts and deletes rows, so it is fail-closed on the target host (loopback only).
 *
 * Run: node supabase/tests/concurrency/san1444_send_receipt_race.mjs
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { resolveLocalDbUrl } from "../../../scripts/lib/local-db-url.mjs";

const connectionString = process.env.SUPABASE_DB_URL ?? resolveLocalDbUrl();
const parsed = new URL(connectionString);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);
if (!LOOPBACK.has(parsed.hostname)) {
  console.error(
    "REFUSING to run: " + parsed.hostname + " is not loopback. This test inserts and deletes rows.",
  );
  process.exit(1);
}

const runId = "t-race-" + randomUUID();
const wamid = runId + "-wamid";
const claimToken = "cccccccc-cccc-cccc-cccc-cccccccccccc";
let failures = 0;
const check = (condition, message) => {
  console.log((condition ? "ok - " : "not ok - ") + message);
  if (!condition) failures += 1;
};

const setup = new Client({ connectionString });
const a = new Client({ connectionString });
const b = new Client({ connectionString });

try {
  await Promise.all([setup.connect(), a.connect(), b.connect()]);

  const seed = await setup.query(
    "insert into public.whatsapp_messages (phone_number, direction, message_type, content, sender, external_id, status, processing_status, attempts, claimed_at, claimed_by, claim_token, next_attempt_at) " +
      "values ('573001112233','inbound','text','race','user',$1,'pending','processing',1,now(),'race-worker',$2,now()) returning id",
    [runId + "-in", claimToken],
  );
  const inboundId = seed.rows[0].id;

  await a.query("begin");
  const resA = await a.query(
    "select public.whatsapp_complete_inbound_with_sends($1, $2, $3::jsonb) as n",
    [inboundId, claimToken, JSON.stringify([{ wamid, content: "race send" }])],
  );

  // The receipt races in while A's transaction still holds the wamid's row lock.
  const pendingB = b.query(
    "select public.whatsapp_record_delivery_status($1, 'delivered', now(), null) as n",
    [wamid],
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  await a.query("commit");
  const resB = await pendingB;

  check(Number(resA.rows[0].n) === 1, "the send RPC recorded exactly one send");
  check(Number(resB.rows[0].n) >= 0, "the racing receipt completed without a unique-constraint error");

  const row = await setup.query(
    "select external_id, direction, status, inbound_message_id from public.whatsapp_messages where external_id = $1",
    [wamid],
  );
  check(row.rowCount === 1, "exactly one row exists for the raced wamid");
  check(row.rows[0].inbound_message_id === inboundId, "the row stays linked to its inbound message");
  check(row.rows[0].status === "delivered", "the receipt advanced the status to delivered");
} catch (error) {
  console.error("race test error:", error instanceof Error ? error.message : error);
  failures += 1;
} finally {
  await setup
    .query("delete from public.whatsapp_messages where external_id like $1", [runId + "%"])
    .catch(() => {});
  await Promise.allSettled([setup.end(), a.end(), b.end()]);
}

console.log(failures === 0 ? "PASS — send/receipt race is safe" : "FAIL — " + failures + " check(s) failed");
process.exit(failures === 0 ? 0 : 1);
