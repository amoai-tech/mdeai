import { assertEquals } from "jsr:@std/assert@1";
import {
  clampLimit,
  constantTimeEqual,
  EMBED_DIM,
  embedDocument,
  isRetryableStatus,
  sanitizeReason,
  validateEmbedding,
} from "../_shared/embedding-worker.ts";

const vec = (n: number) => Array.from({ length: n }, () => 0.01);
const reply = (status: number, body: unknown) =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;

Deno.test("validateEmbedding — accepts exactly 768 finite numbers", () => {
  assertEquals(validateEmbedding(vec(EMBED_DIM)).ok, true);
});

Deno.test("validateEmbedding — refuses wrong length, empty, NaN and non-numbers", () => {
  const wrong = validateEmbedding(vec(10));
  assertEquals(wrong.ok, false);
  assertEquals(!wrong.ok && wrong.retryable, false);
  assertEquals(validateEmbedding([]).ok, false);
  assertEquals(validateEmbedding(undefined).ok, false);
  assertEquals(validateEmbedding([...vec(EMBED_DIM - 1), NaN]).ok, false);
  assertEquals(validateEmbedding([...vec(EMBED_DIM - 1), "x"]).ok, false);
});

Deno.test("embedDocument — 200 with a good vector", async () => {
  const out = await embedDocument("quiet loft", "k", reply(200, { embedding: { values: vec(EMBED_DIM) } }));
  assertEquals(out.ok, true);
});

Deno.test("embedDocument — 400 is permanent, 429 and 500 are retried", async () => {
  const bad = await embedDocument("x", "k", reply(400, {}));
  assertEquals(!bad.ok && bad.retryable, false);
  const limited = await embedDocument("x", "k", reply(429, {}));
  assertEquals(!limited.ok && limited.retryable, true);
  const down = await embedDocument("x", "k", reply(500, {}));
  assertEquals(!down.ok && down.retryable, true);
});

Deno.test("embedDocument — a rejected key is a configuration failure, even when Google reports it as HTTP 400", async () => {
  const invalidKey = { error: { code: 400, status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } };
  for (const [status, body] of [[400, invalidKey], [401, {}], [403, {}], [403, { error: { status: "PERMISSION_DENIED" } }]] as const) {
    const out = await embedDocument("x", "k", reply(status, body));
    assertEquals(!out.ok && out.fatal, true, `HTTP ${status} is fatal`);
    assertEquals(!out.ok && out.reason.includes("API_KEY_INVALID"), false); // the body is never copied into the reason
  }
  // an ordinary 400 about one record stays a permanent, non-fatal failure
  const plain = await embedDocument("x", "k", reply(400, { error: { status: "INVALID_ARGUMENT", details: [] } }));
  assertEquals(!plain.ok && plain.fatal, undefined);
  assertEquals(!plain.ok && plain.retryable, false);
});

Deno.test("embedDocument — empty values and a wrong-size vector are refused", async () => {
  assertEquals((await embedDocument("x", "k", reply(200, { embedding: { values: [] } }))).ok, false);
  const small = await embedDocument("x", "k", reply(200, { embedding: { values: vec(3) } }));
  assertEquals(!small.ok && small.retryable, false);
});

Deno.test("embedDocument — a network error is retried and never leaks the key", async () => {
  const boom = (() => Promise.reject(new Error("connect ECONNREFUSED key=SECRET123"))) as unknown as typeof fetch;
  const out = await embedDocument("x", "SECRET123", boom);
  assertEquals(!out.ok && out.retryable, true);
  assertEquals(!out.ok && out.reason.includes("SECRET123"), false);
});

Deno.test("embedDocument — the key is sent in a header, not the URL", async () => {
  let seenUrl = "";
  let seenKey = "";
  const spy = ((url: string, init: RequestInit) => {
    seenUrl = url;
    seenKey = (init.headers as Record<string, string>)["x-goog-api-key"];
    return Promise.resolve(new Response(JSON.stringify({ embedding: { values: vec(EMBED_DIM) } })));
  }) as unknown as typeof fetch;
  await embedDocument("x", "the-key", spy);
  assertEquals(seenUrl.includes("the-key"), false);
  assertEquals(seenKey, "the-key");
});

Deno.test("constantTimeEqual / isRetryableStatus / sanitizeReason / clampLimit", () => {
  assertEquals(constantTimeEqual("abc", "abc"), true);
  assertEquals(constantTimeEqual("abc", "abd"), false);
  assertEquals(constantTimeEqual("abc", "abcd"), false);
  assertEquals(isRetryableStatus(400), false);
  assertEquals(isRetryableStatus(429), true);
  assertEquals(sanitizeReason("a\n\n  b".padEnd(500, "x")).length, 200);
  assertEquals(clampLimit(undefined), 5);
  assertEquals(clampLimit(0), 1);
  assertEquals(clampLimit(99), 10);
  assertEquals(clampLimit("3"), 5);
});

// ── the batch loop, with a fake database and a fake Gemini ───────────────────────────────────────────────────
import { ClaimFailedError, processEmbeddingBatch, statusForSummary, type BatchSummary, type RpcClient } from "../_shared/embedding-batch.ts";
import { handleEmbeddingRequest, type HandlerDeps } from "../_shared/embedding-handler.ts";
import { EMBED_MODEL } from "../_shared/embedding-worker.ts";

const job = (id: string, over: Record<string, unknown> = {}) => ({
  job_id: id, entity_type: "apartment", entity_id: `e-${id}`, content_hash: "h", model: EMBED_MODEL,
  dimensions: EMBED_DIM, lease_token: `l-${id}`, ...over,
});

function fakeDb(jobs: unknown[], docs: Record<string, unknown>, calls: { fn: string; args: Record<string, unknown> }[]): RpcClient {
  return {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === "claim_embedding_jobs") return Promise.resolve({ data: jobs, error: null });
      if (fn === "embedding_document_for_entity") return Promise.resolve({ data: docs[String(args.p_entity_id)] ?? [], error: null });
      if (fn === "complete_embedding_job") return Promise.resolve({ data: "done", error: null });
      if (fn === "fail_embedding_job") return Promise.resolve({ data: args.p_skip ? "skipped" : args.p_retryable ? "retry" : "failed", error: null });
      return Promise.resolve({ data: null, error: { code: "unknown" } });
    },
  };
}

Deno.test("processEmbeddingBatch — stores a good vector, retries a 429, skips a deleted entity, rejects a foreign model", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = fakeDb(
    [job("ok"), job("limited"), job("gone"), job("alien", { model: "text-embedding-004" })],
    { "e-ok": [{ content_text: "quiet loft" }], "e-limited": [{ content_text: "busy flat" }], "e-alien": [{ content_text: "x" }] },
    calls,
  );
  const embed = (text: string) =>
    Promise.resolve(
      text === "busy flat"
        ? { ok: false as const, retryable: true, reason: "Gemini HTTP 429" }
        : { ok: true as const, values: vec(EMBED_DIM) },
    );
  const summary = await processEmbeddingBatch(db, "k", 5, embed);
  assertEquals(summary, { claimed: 4, done: 1, retry: 1, failed: 1, skipped: 1, superseded: 0, lost_lease: 0, unrecorded: 0, deferred: 0 });
  const completed = calls.filter((c) => c.fn === "complete_embedding_job");
  assertEquals(completed.length, 1);
  assertEquals((completed[0].args.p_values as number[]).length, EMBED_DIM);
  // the Gemini key never reaches the database
  assertEquals(JSON.stringify(calls).includes('"k"'), false);
});

Deno.test("processEmbeddingBatch — an empty queue is a clean no-op", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const summary = await processEmbeddingBatch(fakeDb([], {}, calls), "k", undefined);
  assertEquals(summary.claimed, 0);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].args.p_limit, 5);
});

Deno.test("processEmbeddingBatch — a claim error stops the run", async () => {
  const db: RpcClient = { rpc: () => Promise.resolve({ data: null, error: { code: "42501" } }) };
  let threw = false;
  try {
    await processEmbeddingBatch(db, "k", 5);
  } catch (error) {
    threw = error instanceof ClaimFailedError;
  }
  assertEquals(threw, true);
});

Deno.test("processEmbeddingBatch — a storage error is reported as a retry, not a false done", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = fakeDb([job("a")], { "e-a": [{ content_text: "t" }] }, calls);
  const broken: RpcClient = {
    rpc: (fn, args) => fn === "complete_embedding_job"
      ? Promise.resolve({ data: null, error: { code: "XX000" } })
      : db.rpc(fn, args),
  };
  const summary = await processEmbeddingBatch(broken, "k", 5, () => Promise.resolve({ ok: true as const, values: vec(EMBED_DIM) }));
  assertEquals(summary.done, 0);
  assertEquals(summary.retry, 1);
});

Deno.test("processEmbeddingBatch — a rejected key stops the run and hands every job back unspent", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = fakeDb(
    [job("a"), job("b"), job("c")],
    { "e-a": [{ content_text: "1" }], "e-b": [{ content_text: "2" }], "e-c": [{ content_text: "3" }] },
    calls,
  );
  let embedCalls = 0;
  const embed = () => {
    embedCalls++;
    return Promise.resolve({ ok: false as const, retryable: true, fatal: true as const, reason: "Gemini rejected the API key (HTTP 400)" });
  };
  const summary = await processEmbeddingBatch(db, "k", 5, embed);
  assertEquals(embedCalls, 1); // the other two records were never sent to Gemini
  assertEquals(summary.halted, "gemini_auth");
  assertEquals(summary.retry, 3);
  assertEquals(summary.failed, 0);
  const failures = calls.filter((c) => c.fn === "fail_embedding_job");
  assertEquals(failures.length, 3);
  assertEquals(failures.every((c) => c.args.p_refund_attempt === true && c.args.p_retryable === true), true);
});

Deno.test("processEmbeddingBatch — a failure that cannot be recorded is counted as unrecorded, never as failed", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = fakeDb([job("a")], { "e-a": [{ content_text: "t" }] }, calls);
  const broken: RpcClient = {
    rpc: (fn, args) => fn === "fail_embedding_job" ? Promise.resolve({ data: null, error: { code: "57014" } }) : db.rpc(fn, args),
  };
  const summary = await processEmbeddingBatch(broken, "k", 5, () => Promise.resolve({ ok: false as const, retryable: true, reason: "Gemini HTTP 503" }));
  assertEquals(summary.unrecorded, 1);
  assertEquals(summary.failed + summary.retry + summary.done, 0);
});

Deno.test("statusForSummary — success only when every outcome was recorded", async () => {
  const base = { claimed: 0, done: 0, retry: 0, failed: 0, skipped: 0, superseded: 0, lost_lease: 0, unrecorded: 0, deferred: 0 };
  assertEquals(statusForSummary(base), 200);
  assertEquals(statusForSummary({ ...base, failed: 2, retry: 1 }), 200); // recorded failures are normal operation
  assertEquals(statusForSummary({ ...base, unrecorded: 1 }), 502);
  assertEquals(statusForSummary({ ...base, halted: "gemini_auth" }), 503);
  assertEquals(statusForSummary({ ...base, halted: "gemini_auth", unrecorded: 1 }), 503);

  // end to end through the loop: a failure the database could not record produces a non-2xx status
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = fakeDb([job("a")], { "e-a": [{ content_text: "t" }] }, calls);
  const broken: RpcClient = {
    rpc: (fn, args) => fn === "fail_embedding_job" ? Promise.resolve({ data: null, error: { code: "57014" } }) : db.rpc(fn, args),
  };
  const summary = await processEmbeddingBatch(broken, "k", 5, () => Promise.resolve({ ok: false as const, retryable: true, reason: "Gemini HTTP 503" }));
  assertEquals(statusForSummary(summary), 502);
});

Deno.test("processEmbeddingBatch — at the time budget it stops starting jobs and hands the rest back unspent", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = fakeDb(
    [job("a"), job("b"), job("c")],
    { "e-a": [{ content_text: "1" }], "e-b": [{ content_text: "2" }], "e-c": [{ content_text: "3" }] },
    calls,
  );
  let clock = 0;
  // every embed "takes" 60 s of fake time, so the 90 s budget is gone after the second job
  const embed = () => {
    clock += 60_000;
    return Promise.resolve({ ok: true as const, values: vec(EMBED_DIM) });
  };
  const summary = await processEmbeddingBatch(db, "k", 5, embed, () => clock, 90_000);
  assertEquals(summary.done, 2);
  assertEquals(summary.deferred, 1);
  assertEquals(summary.retry, 1); // the deferred job went back as a retry...
  const handedBack = calls.filter((c) => c.fn === "fail_embedding_job");
  assertEquals(handedBack.length, 1);
  assertEquals(handedBack[0].args.p_refund_attempt, true); // ...with its attempt refunded
  assertEquals(statusForSummary(summary), 200); // running out of time is normal, not an error
});

Deno.test("processEmbeddingBatch — the first job always runs, even with a zero budget", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = fakeDb([job("a"), job("b")], { "e-a": [{ content_text: "1" }], "e-b": [{ content_text: "2" }] }, calls);
  const summary = await processEmbeddingBatch(db, "k", 5, () => Promise.resolve({ ok: true as const, values: vec(EMBED_DIM) }), () => 0, -1);
  assertEquals(summary.done, 1);
  assertEquals(summary.deferred, 1);
});

// ── the HTTP boundary: verify_jwt is off, so these are the only gate in front of the queue ────────────────────
const SECRET = "test-cron-secret-0123456789";
const emptySummary: BatchSummary = {
  claimed: 0, done: 0, retry: 0, failed: 0, skipped: 0, superseded: 0, lost_lease: 0, unrecorded: 0, deferred: 0,
};
function deps(over: Partial<HandlerDeps> = {}, runs: { key: string; limit: unknown }[] = []): HandlerDeps {
  return {
    env: (name) => ({ EMBEDDING_CRON_SECRET: SECRET, GOOGLE_GENERATIVE_AI_API_KEY: "gemini-key-xyz" } as Record<string, string>)[name],
    run: (key, limit) => {
      runs.push({ key, limit });
      return Promise.resolve(emptySummary);
    },
    ...over,
  };
}
const post = (headers: Record<string, string> = {}, body?: string) =>
  new Request("https://x.test/functions/v1/process-embedding-jobs", { method: "POST", headers, body });

Deno.test("handler — only POST is accepted", async () => {
  const runs: { key: string; limit: unknown }[] = [];
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const res = await handleEmbeddingRequest(new Request("https://x.test/", { method }), deps({}, runs));
    assertEquals(res.status, 405);
  }
  assertEquals(runs.length, 0);
});

Deno.test("handler — no secret, a wrong secret or a near-miss are refused and nothing runs", async () => {
  const runs: { key: string; limit: unknown }[] = [];
  for (const headers of <Record<string, string>[]> [{}, { "x-cron-secret": "" }, { "x-cron-secret": "wrong" }, { "x-cron-secret": SECRET + "x" }, { "x-cron-secret": SECRET.slice(0, -1) }, { authorization: `Bearer ${SECRET}` }]) {
    const res = await handleEmbeddingRequest(post(headers), deps({}, runs));
    assertEquals(res.status, 401);
    assertEquals(await res.json(), { error: "unauthorized" });
  }
  assertEquals(runs.length, 0); // the queue is never touched without the secret
});

Deno.test("handler — a missing secret is a 500 not_configured, never an open door", async () => {
  const runs: { key: string; limit: unknown }[] = [];
  const noCron = deps({ env: (n) => (n === "GOOGLE_GENERATIVE_AI_API_KEY" ? "k" : undefined) }, runs);
  const noGemini = deps({ env: (n) => (n === "EMBEDDING_CRON_SECRET" ? SECRET : undefined) }, runs);
  for (const d of [noCron, noGemini]) {
    // even a caller presenting an EMPTY secret must not get in when the configured one is missing
    const res = await handleEmbeddingRequest(post({ "x-cron-secret": "" }), d);
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "not_configured" });
  }
  assertEquals(runs.length, 0);
});

Deno.test("handler — the right secret runs one batch with the requested limit and never echoes a secret", async () => {
  const runs: { key: string; limit: unknown }[] = [];
  const res = await handleEmbeddingRequest(post({ "x-cron-secret": SECRET }, JSON.stringify({ limit: 3 })), deps({}, runs));
  assertEquals(res.status, 200);
  assertEquals(runs, [{ key: "gemini-key-xyz", limit: 3 }]);
  const text = await res.text();
  assertEquals(text.includes(SECRET) || text.includes("gemini-key-xyz"), false);
});

Deno.test("handler — an empty or invalid body from the scheduler still runs with the default limit", async () => {
  const runs: { key: string; limit: unknown }[] = [];
  await handleEmbeddingRequest(post({ "x-cron-secret": SECRET }), deps({}, runs));
  await handleEmbeddingRequest(post({ "x-cron-secret": SECRET }, "not json"), deps({}, runs));
  assertEquals(runs.map((r) => r.limit), [undefined, undefined]);
});

Deno.test("handler — failures map to non-2xx statuses and leak nothing", async () => {
  const auth = { "x-cron-secret": SECRET };
  const halted = await handleEmbeddingRequest(post(auth), deps({ run: () => Promise.resolve({ ...emptySummary, halted: "gemini_auth" }) }));
  assertEquals(halted.status, 503);
  const unrecorded = await handleEmbeddingRequest(post(auth), deps({ run: () => Promise.resolve({ ...emptySummary, unrecorded: 1 }) }));
  assertEquals(unrecorded.status, 502);
  const claim = await handleEmbeddingRequest(post(auth), deps({ run: () => Promise.reject(new ClaimFailedError("42501")) }));
  assertEquals(claim.status, 500);
  assertEquals(await claim.json(), { error: "claim_failed" });
  const boom = await handleEmbeddingRequest(post(auth), deps({ run: () => Promise.reject(new Error(`db password=${SECRET}`)) }));
  assertEquals(boom.status, 500);
  const text = JSON.stringify(await boom.json());
  assertEquals(text.includes(SECRET), false); // an unexpected error message is never returned to the caller
});
