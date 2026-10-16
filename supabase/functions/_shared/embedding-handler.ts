/**
 * SAN-1523 — the HTTP side of process-embedding-jobs, separated from Deno.serve so the authentication boundary
 * can be tested. The function is deployed with verify_jwt = false (the caller is pg_cron/pg_net or an operator,
 * never a user), so THIS function is the only thing standing between the public URL and the queue.
 */
import { ClaimFailedError, statusForSummary, type BatchSummary } from "./embedding-batch.ts";
import { constantTimeEqual } from "./embedding-worker.ts";

export type HandlerDeps = {
  /** reads a secret from the environment (injected so tests never touch real secrets) */
  env: (name: string) => string | undefined;
  /** runs one batch; production wires this to processEmbeddingBatch with the service client */
  run: (geminiKey: string, limit: unknown) => Promise<BatchSummary>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handleEmbeddingRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = deps.env("EMBEDDING_CRON_SECRET");
  const geminiKey = deps.env("GOOGLE_GENERATIVE_AI_API_KEY");
  if (!expected || !geminiKey) {
    // Misconfiguration: say so without revealing which value is missing to an unauthenticated caller.
    console.error("[process-embedding-jobs] missing required secrets");
    return json({ error: "not_configured" }, 500);
  }
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!constantTimeEqual(provided, expected)) return json({ error: "unauthorized" }, 401);

  let limit: unknown;
  try {
    limit = (await req.json())?.limit;
  } catch {
    limit = undefined; // an empty body from the scheduler is fine
  }

  try {
    const summary = await deps.run(geminiKey, limit);
    console.log("[process-embedding-jobs]", JSON.stringify(summary));
    // 503 when the run stopped on a configuration problem, 502 when an outcome could not be recorded:
    // the scheduler's HTTP result must never report success for either.
    return json(summary, statusForSummary(summary));
  } catch (error) {
    if (error instanceof ClaimFailedError) {
      console.error("[process-embedding-jobs] claim failed", error.message);
      return json({ error: "claim_failed" }, 500);
    }
    console.error("[process-embedding-jobs] unexpected failure");
    return json({ error: "internal_error" }, 500);
  }
}
