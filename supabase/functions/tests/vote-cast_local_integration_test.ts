// SAN-1498: real local integration — authenticated HTTP handler -> public RPC -> private
// vote schema -> persisted receipt. Written because SQL/handler tests alone do not prove the
// full deployed-style path.
//
// Opt-in (so normal CI/local runs never touch a database):
//   VOTE_LOCAL_IT=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres \
//   deno test --allow-env --allow-read --allow-run --allow-net --node-modules-dir=auto \
//     supabase/functions/tests/vote-cast_local_integration_test.ts
//
// It creates its own user, org, contest and entries, then deletes them. It never touches
// production and never reuses a real contest.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createVoteCastHandler } from "../vote-cast/handler.ts";
import { createVoteNonceHandler } from "../vote-nonce/handler.ts";
import { getUserId } from "../_shared/supabase-clients.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { verifyNonce, issueNonce } from "../_shared/nonce.ts";
import { allowRateDurable } from "../_shared/rate-limit.ts";

const RUN = Deno.env.get("VOTE_LOCAL_IT") === "1";
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB = Deno.env.get("LOCAL_DB_URL") ?? "";

// Refuse to run against anything that is not a local database.
function assertLocalDb(url: string): void {
  let host = "";
  try { host = new globalThis.URL(url).hostname; } catch { host = ""; }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && host !== "[::1]") {
    throw new Error("Refusing to run: LOCAL_DB_URL must be a local database, got host '" + host + "'");
  }
}

// Only the nonces this run issued may be cleaned up.
const issuedJtis = new Set<string>();
function decodeJti(token: string): string | null {
  try {
    const body = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.jti === "string" ? json.jti : null;
  } catch { return null; }
}

const ORG = "f0000000-0000-0000-0000-0000000000e1";
// Unique source IP per run so the real per-IP rate limiter does not bleed across runs.
const IP = "10." + (Math.floor(Math.random() * 200) + 1) + "." + (Math.floor(Math.random() * 200) + 1) + "." + (Math.floor(Math.random() * 200) + 1);
const CONTEST = "c0000000-0000-0000-0000-0000000000e1";
const ENTITY = "e0000000-0000-0000-0000-0000000000e1";
const ENTITY2 = "e0000000-0000-0000-0000-0000000000e2";

// Lazily built so the module loads (and the test is skipped) without a live stack.
let _service: any = null;
function svc(): any {
  if (!_service) _service = createClient(URL, SERVICE, { auth: { persistSession: false } });
  return _service;
}
let _handler: any = null;
function getHandler(): (req: Request) => Promise<Response> {
  if (!_handler) {
    const s = svc();
    _handler = createVoteCastHandler({
      service: s,
      verifyTurnstile,
      verifyNonce,
      getUserId,
      allowRate: (key: string, max: number, win: number) => allowRateDurable(s, key, max, win),
    });
  }
  return _handler;
}

async function sql(q: string): Promise<string> {
  const cmd = new Deno.Command("psql", { args: [DB, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", q], stdout: "piped", stderr: "piped" });
  const out = await cmd.output();
  if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
  return new TextDecoder().decode(out.stdout).trim();
}
function assertEqual(a: unknown, b: unknown, m: string): void {
  if (a !== b) throw new Error(m + " — expected " + String(b) + ", got " + String(a));
}
let _nonceHandler: ((req: Request) => Promise<Response>) | null = null;
function getNonceHandler(): (req: Request) => Promise<Response> {
  if (!_nonceHandler) {
    const s = svc();
    _nonceHandler = createVoteNonceHandler({
      service: s,
      getUserId,
      issueNonce,
      allowRate: (key: string, max: number, win: number) => allowRateDurable(s, key, max, win),
    });
  }
  return _nonceHandler;
}
// Obtain the ticket the way a real client does: authenticated call to the issuer.
async function nonce(jwt: string): Promise<string> {
  const res = await getNonceHandler()(new Request("http://local.test/vote-nonce", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + jwt, "x-forwarded-for": IP },
    body: JSON.stringify({ contest_id: CONTEST }),
  }));
  const json = await res.json() as { data?: { nonce?: string } };
  if (res.status !== 200 || !json.data?.nonce) {
    throw new Error("nonce issuer failed: " + res.status + " " + JSON.stringify(json));
  }
  const jti = decodeJti(json.data.nonce);
  if (jti) issuedJtis.add(jti);
  return json.data.nonce;
}
function body(entity: string, key: string, n: string): string {
  return JSON.stringify({ contest_id: CONTEST, entity_id: entity, idempotency_key: key, nonce: n, turnstile_token: "t" });
}
function request(entity: string, key: string, n: string, jwt: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": IP };
  if (jwt) headers.authorization = "Bearer " + jwt;
  return new Request("http://local.test/vote-cast", { method: "POST", headers, body: body(entity, key, n) });
}
async function statusOf(res: Response): Promise<number> { return res.status; }
async function jsonOf(res: Response): Promise<Record<string, unknown>> { return await res.json() as Record<string, unknown>; }

async function makeUser(tag: string): Promise<{ id: string; jwt: string; email: string }> {
  const email = "vote-it-" + tag + "-" + Date.now() + "@example.com";
  const created = await svc().auth.admin.createUser({ email, password: "test-pass-123!", email_confirm: true });
  if (created.error || !created.data.user) throw new Error("createUser: " + JSON.stringify(created.error));
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const signed = await anon.auth.signInWithPassword({ email, password: "test-pass-123!" });
  if (signed.error || !signed.data.session) throw new Error("signIn: " + JSON.stringify(signed.error));
  return { id: created.data.user.id, jwt: signed.data.session.access_token, email };
}

async function setup(): Promise<void> {
  await cleanup();
  await sql("insert into public.profiles (id, email) values ('" + ORG + "', 'vote-it-org@example.com');");
  await sql("insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values ('" + CONTEST + "', 'vote-it-contest', 'restaurant', 'Vote IT', '" + ORG + "', now() - interval '1 day', now() + interval '1 day', 'live');");
  await sql("insert into vote.entities (id, contest_id, slug, display_name, approved) values ('" + ENTITY + "', '" + CONTEST + "', 'it-one', 'IT One', true), ('" + ENTITY2 + "', '" + CONTEST + "', 'it-two', 'IT Two', true);");
}
async function cleanup(): Promise<void> {
  await sql("delete from vote.votes where contest_id = '" + CONTEST + "'; delete from vote.entities where contest_id = '" + CONTEST + "'; delete from vote.contests where id = '" + CONTEST + "'; delete from public.profiles where id = '" + ORG + "';");
  // Delete ONLY the nonces this run consumed; never touch another caller's tickets.
  const jtis = Array.from(issuedJtis).map((j) => "'" + j + "'").join(",");
  if (jtis) await sql("delete from public.vote_consumed_nonces where jti in (" + jtis + ");");
}

Deno.test({ name: "local integration: authenticated vote -> receipt -> retry -> isolation", ignore: !RUN, fn: async () => {
  Deno.env.set("ENVIRONMENT", "test");
  Deno.env.set("VOTE_NONCE_SECRET", "vote-it-secret");
  assertLocalDb(DB);
  try {
    await setup();
    const userA = await makeUser("a");
    const userB = await makeUser("b");
    try {
      // 1. valid authenticated user casts exactly one ballot
      const res1 = await getHandler()(request(ENTITY, "11111111-0000-0000-0000-000000000001", await nonce(userA.jwt), userA.jwt));
      assertEqual(await statusOf(res1), 200, "first vote status");
      const j1 = await jsonOf(res1);
      assertEqual((j1.data as Record<string, unknown>).status, "cast", "first vote status field");
      assertEqual(await sql("select count(*) from vote.votes where contest_id = '" + CONTEST + "' and voter_user_id = '" + userA.id + "'"), "1", "one row for user A");

      // 2. retry with the same idempotency key returns the original receipt, no new row
      const res2 = await getHandler()(request(ENTITY, "11111111-0000-0000-0000-000000000001", await nonce(userA.jwt), userA.jwt));
      assertEqual(await statusOf(res2), 200, "retry status");
      assertEqual(((await jsonOf(res2)).data as Record<string, unknown>).status, "replayed", "retry returns original receipt");
      assertEqual(await sql("select count(*) from vote.votes where contest_id = '" + CONTEST + "' and voter_user_id = '" + userA.id + "'"), "1", "still one row after retry");

      // 3. same user, different restaurant, new key -> already_voted, no second ballot
      const res3 = await getHandler()(request(ENTITY2, "11111111-0000-0000-0000-000000000002", await nonce(userA.jwt), userA.jwt));
      assertEqual(await statusOf(res3), 200, "second restaurant status");
      assertEqual(((await jsonOf(res3)).data as Record<string, unknown>).status, "already_voted", "no second ballot");
      assertEqual(await sql("select count(*) from vote.votes where contest_id = '" + CONTEST + "' and voter_user_id = '" + userA.id + "'"), "1", "still one row for user A");

      // 4. a different authenticated user is independent
      const res4 = await getHandler()(request(ENTITY2, "11111111-0000-0000-0000-000000000003", await nonce(userB.jwt), userB.jwt));
      assertEqual(await statusOf(res4), 200, "user B status");
      assertEqual(((await jsonOf(res4)).data as Record<string, unknown>).status, "cast", "user B casts");
      assertEqual(await sql("select count(*) from vote.votes where contest_id = '" + CONTEST + "' and voter_user_id = '" + userB.id + "'"), "1", "one row for user B");

      // 5. cross-user receipt isolation: B cannot read A receipt
      const stolen = await svc().rpc("vote_receipt", { p_contest_id: CONTEST, p_user_id: userB.id, p_idempotency_key: "11111111-0000-0000-0000-000000000001" });
      assertEqual(stolen.data, null, "cross-user receipt is not returned");

      // 6. missing JWT -> 401
      const res6 = await getHandler()(request(ENTITY, "11111111-0000-0000-0000-000000000004", await nonce(userA.jwt), null));
      assertEqual(await statusOf(res6), 401, "missing JWT rejected");

      // 7. replayed nonce with no committed vote -> recoverable 409
      const n7 = await nonce(userB.jwt);
      await getHandler()(request(ENTITY, "11111111-0000-0000-0000-000000000005", n7, userB.jwt));
      const res7 = await getHandler()(request(ENTITY, "11111111-0000-0000-0000-000000000006", n7, userB.jwt));
      assertEqual(await statusOf(res7), 409, "replayed nonce without a committed vote");
      assertEqual(((await jsonOf(res7)).error as Record<string, unknown>).code, "NONCE_REPLAYED", "recoverable nonce error");
      assertEqual(await sql("select count(*) from vote.votes where contest_id = '" + CONTEST + "'"), "2", "no extra ballots from nonce replay");
    } finally {
      await svc().auth.admin.deleteUser(userA.id);
      await svc().auth.admin.deleteUser(userB.id);
      await cleanup();
    }
  } catch (e) {
    await cleanup();
    throw e;
  }
} });
