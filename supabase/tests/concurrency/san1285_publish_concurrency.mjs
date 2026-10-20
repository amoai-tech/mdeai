/**
 * SAN-1285 — real two-connection proof for the atomic event publish claim.
 *
 * pgTAP runs in one transaction and cannot exercise the unique-index wait that
 * makes concurrent retries produce one event. This opens two independent
 * connections: caller A claims the proposal and holds its transaction open, then
 * caller B calls with the same proposal while A is uncommitted. B must block on
 * the SAN-1548 proposal unique index, then return A's event once A commits.
 *
 * SAFETY: inserts and deletes rows, so it is fail-closed on the target host and
 * only reuses the repository's local-URL resolver (loopback only).
 *
 * Run: node supabase/tests/concurrency/san1285_publish_concurrency.mjs
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

// Unique per-run ids so the test can never touch another run's rows.
const runId = randomUUID().slice(0, 8);
const userId = randomUUID();
const proposalId = randomUUID();
const slug = "san1285-conc-" + runId;
const email = "san1285-conc-" + runId + "@example.com";

const draft = {
  title: "SAN-1285 Concurrency " + runId,
  neighborhood: "Laureles",
  dateIso: "2099-08-01T20:00:00-05:00",
  venue: "Son Havana",
  priceMinCop: 30000,
  capacity: 50,
  description: "Concurrency fixture",
  ticketTiers: [],
};
const claims = JSON.stringify({ sub: userId, role: "authenticated" });

let failures = 0;
function check(condition, message) {
  console.log((condition ? "ok - " : "not ok - ") + message);
  if (!condition) failures += 1;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const seed = new Client({ connectionString });
const a = new Client({ connectionString });
const b = new Client({ connectionString });

try {
  await Promise.all([seed.connect(), a.connect(), b.connect()]);
  await seed.query(
    "insert into auth.users (id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [userId, email],
  );
  await seed.query(
    "insert into public.profiles (id, email, full_name) values ($1,$2,'SAN 1285 Concurrency') on conflict (id) do update set full_name=excluded.full_name",
    [userId, email],
  );

  const call = (client) =>
    client.query(
      "select public.publish_event_tx($1::text, $2::jsonb, $3::text) as receipt",
      [proposalId, JSON.stringify(draft), slug],
    );

  await a.query("begin");
  await a.query("set local role authenticated");
  await a.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  const aRes = await call(a);
  const aEventId = aRes.rows[0].receipt.eventId;
  check(Boolean(aEventId), "caller A claimed the publish and holds the transaction open");

  await b.query("begin");
  await b.query("set local role authenticated");
  await b.query("select set_config('request.jwt.claims', $1, true)", [claims]);

  let bSettled = false;
  const bPromise = call(b).then((result) => {
    bSettled = true;
    return result;
  });
  await sleep(900);
  check(!bSettled, "concurrent caller B is blocked while A is uncommitted");

  await a.query("commit");
  const bRes = await bPromise;
  await b.query("commit");

  check(
    bRes.rows[0].receipt.eventId === aEventId,
    "both callers receive the same committed event id",
  );
  const count = await seed.query(
    "select count(*)::int as n from public.events where approval_request_id = (select id from public.approval_requests where proposal_id=$1)",
    [proposalId],
  );
  check(count.rows[0].n === 1, "exactly one event exists after a concurrent retry");
  const tiers = await seed.query(
    "select count(*)::int as n from public.event_tickets where event_id=$1",
    [aEventId],
  );
  check(tiers.rows[0].n === 1, "exactly one ticket tier exists after a concurrent retry");
} finally {
  try {
    await seed.query(
      "delete from public.event_tickets where event_id in (select id from public.events where approval_request_id in (select id from public.approval_requests where proposal_id=$1))",
      [proposalId],
    );
    await seed.query(
      "delete from public.events where approval_request_id in (select id from public.approval_requests where proposal_id=$1)",
      [proposalId],
    );
    await seed.query(
      "delete from public.approval_decisions where request_id in (select id from public.approval_requests where proposal_id=$1)",
      [proposalId],
    );
    await seed.query("delete from public.approval_requests where proposal_id=$1", [proposalId]);
    await seed.query("delete from public.profiles where id=$1", [userId]);
    await seed.query("delete from auth.users where id=$1", [userId]);
  } catch (error) {
    console.error("cleanup warning:", error.message);
  }
  await Promise.allSettled([seed.end(), a.end(), b.end()]);
}

process.exit(failures === 0 ? 0 : 1);
