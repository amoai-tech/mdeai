// SAN-1521/nonce — HTTP contract for the vote nonce issuer.
// Deterministic stubs, no server, no network.
import { createVoteNonceHandler, type VoteNonceDeps, type RpcError } from "../vote-nonce/handler.ts";

const C = "c0000000-0000-0000-0000-000000000001";
const USER = "a0000000-0000-0000-0000-000000000001";

function assertEqual<T>(a: T, b: T, m: string): void {
  if (a !== b) throw new Error(m + " — expected " + String(b) + ", got " + String(a));
}
function request(auth: boolean, contestId: string = C): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" };
  if (auth) headers.authorization = "Bearer test-jwt";
  return new Request("https://x.test/vote-nonce", { method: "POST", headers, body: JSON.stringify({ contest_id: contestId }) });
}
function deps(opts: {
  context?: unknown;
  ctxError?: RpcError | null;
  userId?: string | null;
  allowed?: boolean;
  issue?: () => Promise<string>;
} = {}): VoteNonceDeps {
  return {
    service: {
      rpc: async () => ({
        data: "context" in opts ? opts.context : { kind: "restaurant", voting_available: true },
        error: opts.ctxError ?? null,
      }),
    },
    getUserId: async () => (opts.userId === undefined ? USER : opts.userId),
    issueNonce: opts.issue ?? (async () => "signed.nonce.token"),
    allowRate: async () => (opts.allowed === false ? { allowed: false, retry_after_seconds: 9 } : { allowed: true, retry_after_seconds: 0 }),
  };
}
async function call(d: VoteNonceDeps, req: Request) {
  const res = await createVoteNonceHandler(d)(req);
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}
function codeOf(json: Record<string, unknown>): unknown {
  const e = json.error as Record<string, unknown> | undefined;
  return e?.code ?? json.code;
}

Deno.test("CORS preflight returns bodyless 204 with allowed origin", async () => {
  const request = new Request("https://x.test/vote-nonce", {
    method: "OPTIONS",
    headers: { Origin: "https://mdeai.co", "Access-Control-Request-Method": "POST" },
  });
  const response = await createVoteNonceHandler(deps())(request);
  assertEqual(response.status, 204, "preflight status");
  assertEqual(await response.text(), "", "204 response must not contain a body");
  assertEqual(response.headers.get("Access-Control-Allow-Origin"), "https://mdeai.co", "allowed origin");
});

Deno.test("no JWT -> 401 AUTH_REQUIRED", async () => {
  const r = await call(deps({ userId: null }), request(false));
  assertEqual(r.status, 401, "status");
  assertEqual(codeOf(r.json), "AUTH_REQUIRED", "code");
});
Deno.test("rate limited -> 429", async () => {
  const r = await call(deps({ allowed: false }), request(true));
  assertEqual(r.status, 429, "status");
});
Deno.test("unknown contest -> 404", async () => {
  const r = await call(deps({ context: null }), request(true));
  assertEqual(r.status, 404, "status");
});
Deno.test("non-restaurant contest -> 409", async () => {
  const r = await call(deps({ context: { kind: "pageant", voting_available: true } }), request(true));
  assertEqual(r.status, 409, "status");
  assertEqual(codeOf(r.json), "NOT_A_RESTAURANT_CONTEST", "code");
});
Deno.test("not accepting votes -> 410", async () => {
  const r = await call(deps({ context: { kind: "restaurant", voting_available: false } }), request(true));
  assertEqual(r.status, 410, "status");
  assertEqual(codeOf(r.json), "CONTEST_CLOSED", "code");
});
Deno.test("rpc error -> 500, no nonce", async () => {
  const r = await call(deps({ ctxError: { code: "XX000", message: "boom" } }), request(true));
  assertEqual(r.status, 500, "status");
});
Deno.test("happy path -> 200 with a signed nonce", async () => {
  const r = await call(deps(), request(true));
  assertEqual(r.status, 200, "status");
  assertEqual((r.json.data as Record<string, unknown>).nonce, "signed.nonce.token", "nonce");
});
Deno.test("missing VOTE_NONCE_SECRET -> 503, not a fake nonce", async () => {
  const r = await call(deps({ issue: async () => { throw new Error("VOTE_NONCE_SECRET is not configured"); } }), request(true));
  assertEqual(r.status, 503, "status");
  assertEqual(codeOf(r.json), "NONCE_UNAVAILABLE", "code");
});
Deno.test("invalid body -> 400", async () => {
  const req = new Request("https://x.test/vote-nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contest_id: "not-a-uuid" }) });
  const r = await call(deps(), req);
  assertEqual(r.status, 400, "status");
});
