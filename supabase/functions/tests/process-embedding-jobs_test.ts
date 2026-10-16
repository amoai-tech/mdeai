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
import { ClaimFailedError, processEmbeddingBatch, type RpcClient } from "../_shared/embedding-batch.ts";
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
  assertEquals(summary, { claimed: 4, done: 1, retry: 1, failed: 1, skipped: 1, superseded: 0, lost_lease: 0 });
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
