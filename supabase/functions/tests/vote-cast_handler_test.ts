// SAN-1498: HTTP contract for the restaurant vote handler.
// Dependency-free (no jsr/npm imports) — deterministic stubs, no server, no network.
import { createVoteCastHandler, type VoteCastDeps, type RpcError } from "../vote-cast/handler.ts";

const C = "c0000000-0000-0000-0000-000000000001";
const E = "e0000000-0000-0000-0000-000000000001";
const K = "11111111-1111-1111-1111-111111111111";
const USER = "a0000000-0000-0000-0000-000000000001";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(message + " — expected " + String(expected) + ", got " + String(actual));
  }
}

function makeRequest(opts: { auth?: boolean; body?: Record<string, unknown> } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== false) headers.authorization = "Bearer test-jwt";
  const payload = Object.assign(
    { contest_id: C, entity_id: E, turnstile_token: "t", nonce: "n", idempotency_key: K },
    opts.body ?? {},
  );
  return new Request("https://x.test/vote-cast", { method: "POST", headers, body: JSON.stringify(payload) });
}

type RpcFn = (args: Record<string, unknown>) => { data: unknown; error: RpcError | null };

function deps(opts: {
  rpc?: Record<string, RpcFn>;
  turnstile?: string;
  nonce?: unknown;
  userId?: string | null;
  allowed?: boolean;
  logError?: unknown;
  phase?: string | null;
} = {}): VoteCastDeps & { turnstileCalls: () => number } {
  const calls = { n: 0 };
  const base: Record<string, RpcFn> = {
    vote_consume_nonce: () => ({ data: true, error: null }),
    vote_receipt: () => ({ data: null, error: null }),
    vote_contest_context: () => ({
      data: {
        kind: "restaurant",
        is_open: true,
        voting_available: true,
        application_phase: opts.phase === undefined ? "development" : opts.phase,
      },
      error: null,
    }),
    cast_restaurant_vote: () => ({ data: { status: "cast", vote_id: "v1", contest_id: C, entity_id: E }, error: null }),
    vote_tally: () => ({ data: { audience_total: 1, audience_accepted: 0, audience_pending: 1 }, error: null }),
  };
  const rpc = Object.assign(base, opts.rpc ?? {});
  return {
    service: {
      rpc: async (name: string, args?: Record<string, unknown>) => rpc[name] ? rpc[name](args ?? {}) : { data: null, error: null },
      from: () => ({ insert: async () => ({ error: opts.logError ?? null }) }),
    },
    verifyTurnstile: async () => { calls.n++; return (opts.turnstile ?? "ok") as "ok"; },
    verifyNonce: async () => (opts.nonce ?? { valid: true, payload: { jti: "jti-1" } }) as { valid: boolean },
    getUserId: async () => (opts.userId === undefined ? USER : opts.userId),
    allowRate: async () => (opts.allowed === false ? { allowed: false, retry_after_seconds: 5 } : { allowed: true, retry_after_seconds: 0 }),
    turnstileCalls: () => calls.n,
  };
}

async function call(d: VoteCastDeps, req: Request): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await createVoteCastHandler(d)(req);
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, json };
}
function codeOf(json: Record<string, unknown>): unknown {
  const e = json.error as Record<string, unknown> | undefined;
  return e?.code ?? (json.code as unknown);
}

Deno.test("no/invalid JWT -> 401 AUTH_REQUIRED", async () => {
  const r = await call(deps({ userId: null }), makeRequest({ auth: false }));
  assertEqual(r.status, 401, "status");
  assertEqual(codeOf(r.json), "AUTH_REQUIRED", "code");
});

Deno.test("unapproved restaurant -> 409 RESTAURANT_NOT_APPROVED", async () => {
  const r = await call(deps({ rpc: { cast_restaurant_vote: () => ({ data: null, error: { code: "22023", message: "RESTAURANT_NOT_APPROVED" } }) } }), makeRequest());
  assertEqual(r.status, 409, "status");
  assertEqual(codeOf(r.json), "RESTAURANT_NOT_APPROVED", "code");
});

Deno.test("closed contest -> 410 CONTEST_CLOSED", async () => {
  const r = await call(deps({ rpc: { vote_contest_context: () => ({ data: { kind: "restaurant", is_open: false, voting_available: false, application_phase: "development" }, error: null }) } }), makeRequest());
  assertEqual(r.status, 410, "status");
  assertEqual(codeOf(r.json), "CONTEST_CLOSED", "code");
});

Deno.test("rate limit exceeded -> 429 RATE_LIMITED", async () => {
  const r = await call(deps({ allowed: false }), makeRequest());
  assertEqual(r.status, 429, "status");
  assertEqual(codeOf(r.json), "RATE_LIMITED", "code");
});

Deno.test("launch: turnstile unavailable -> 503", async () => {
  const r = await call(deps({ phase: "launch", turnstile: "unavailable" }), makeRequest());
  assertEqual(r.status, 503, "status");
  assertEqual(codeOf(r.json), "TURNSTILE_UNAVAILABLE", "code");
});

Deno.test("launch: turnstile misconfigured (missing secret) -> 503", async () => {
  const r = await call(deps({ phase: "launch", turnstile: "misconfigured" }), makeRequest());
  assertEqual(r.status, 503, "status");
});

Deno.test("launch: invalid turnstile token -> 403", async () => {
  const r = await call(deps({ phase: "launch", turnstile: "invalid" }), makeRequest());
  assertEqual(r.status, 403, "status");
  assertEqual(codeOf(r.json), "TURNSTILE_FAILED", "code");
});

Deno.test("launch: valid token votes when otherwise eligible -> 200", async () => {
  const r = await call(deps({ phase: "launch", turnstile: "ok" }), makeRequest());
  assertEqual(r.status, 200, "status");
});

Deno.test("development: Turnstile is never called and voting succeeds -> 200", async () => {
  const d = deps({ phase: "development" });
  const r = await call(d, makeRequest());
  assertEqual(r.status, 200, "status");
  assertEqual(d.turnstileCalls(), 0, "turnstile must not be called in development");
});

Deno.test("development: anonymous user -> 401", async () => {
  const r = await call(deps({ phase: "development", userId: null }), makeRequest({ auth: false }));
  assertEqual(r.status, 401, "status");
});

Deno.test("development: invalid nonce -> 403 (nonce still enforced)", async () => {
  const r = await call(deps({ phase: "development", nonce: { valid: false, reason: "invalid_signature" } }), makeRequest());
  assertEqual(r.status, 403, "status");
});

Deno.test("unknown/missing phase -> 503 PHASE_UNAVAILABLE (fail closed)", async () => {
  const r = await call(deps({ phase: null }), makeRequest());
  assertEqual(r.status, 503, "status");
  assertEqual(codeOf(r.json), "PHASE_UNAVAILABLE", "code");
});

Deno.test("replayed nonce with no committed ballot -> 409 NONCE_REPLAYED", async () => {
  const r = await call(deps({ rpc: { vote_consume_nonce: () => ({ data: false, error: null }) } }), makeRequest());
  assertEqual(r.status, 409, "status");
  assertEqual(codeOf(r.json), "NONCE_REPLAYED", "code");
});

Deno.test("same account tries another restaurant -> original receipt, no second ballot", async () => {
  const r = await call(deps({ rpc: { cast_restaurant_vote: () => ({ data: { status: "already_voted", vote_id: "v1", entity_id: E }, error: null }) } }), makeRequest());
  assertEqual(r.status, 200, "status");
  assertEqual((r.json.data as Record<string, unknown>).status, "already_voted", "status field");
});

Deno.test("retried committed request recovers the original receipt", async () => {
  const r = await call(deps({ rpc: {
    vote_consume_nonce: () => ({ data: false, error: null }),
    vote_receipt: () => ({ data: { status: "replayed", vote_id: "v1", entity_id: E }, error: null }),
  } }), makeRequest());
  assertEqual(r.status, 200, "status");
  assertEqual((r.json.data as Record<string, unknown>).status, "replayed", "status field");
});

Deno.test("analytics logging failure still returns 200 with the receipt", async () => {
  const r = await call(deps({ logError: { message: "ai_runs insert failed" } }), makeRequest());
  assertEqual(r.status, 200, "status");
  assertEqual((r.json.data as Record<string, unknown>).vote_id, "v1", "receipt");
});

Deno.test("database write failure -> 500, no false success", async () => {
  const r = await call(deps({ rpc: { cast_restaurant_vote: () => ({ data: null, error: { code: "XX000", message: "boom" } }) } }), makeRequest());
  assertEqual(r.status, 500, "status");
  assertEqual(codeOf(r.json), "VOTE_FAILED", "code");
});
