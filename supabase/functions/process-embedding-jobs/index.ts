/**
 * SAN-1523 — process-embedding-jobs: drain a few jobs from public.embedding_jobs.
 *
 * Flow per invocation: authenticate -> claim <= 5 jobs (lease) -> for each: read the CURRENT document,
 * embed it with Gemini (gemini-embedding-001, 768 dims) -> complete atomically in the database.
 * The database functions (claim/complete/fail) are the only writers; a stale vector can never overwrite a
 * newer edit, and a retry never double-writes. Scheduling is a separate migration (PR 2 of SAN-1523).
 *
 * Secrets (never logged): EMBEDDING_CRON_SECRET (caller), GOOGLE_GENERATIVE_AI_API_KEY (Gemini),
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).
 */
import { getServiceClient } from "../_shared/supabase-clients.ts";
import { ClaimFailedError, processEmbeddingBatch } from "../_shared/embedding-batch.ts";
import { constantTimeEqual } from "../_shared/embedding-worker.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("EMBEDDING_CRON_SECRET");
  const geminiKey = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
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
    const summary = await processEmbeddingBatch(getServiceClient(), geminiKey, limit);
    console.log("[process-embedding-jobs]", JSON.stringify(summary));
    // 503 when the run stopped on a configuration problem, so the scheduler's HTTP result shows it.
    return json(summary, summary.halted ? 503 : 200);
  } catch (error) {
    if (error instanceof ClaimFailedError) {
      console.error("[process-embedding-jobs] claim failed", error.message);
      return json({ error: "claim_failed" }, 500);
    }
    console.error("[process-embedding-jobs] unexpected failure");
    return json({ error: "internal_error" }, 500);
  }
});
