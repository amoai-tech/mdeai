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
 *
 * The request handling lives in ../_shared/embedding-handler.ts (tested, including the auth boundary).
 */
import { getServiceClient } from "../_shared/supabase-clients.ts";
import { processEmbeddingBatch } from "../_shared/embedding-batch.ts";
import { handleEmbeddingRequest } from "../_shared/embedding-handler.ts";

Deno.serve((req: Request) =>
  handleEmbeddingRequest(req, {
    env: (name) => Deno.env.get(name),
    run: (geminiKey, limit) => processEmbeddingBatch(getServiceClient(), geminiKey, limit),
  })
);
