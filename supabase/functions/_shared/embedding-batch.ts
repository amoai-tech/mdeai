/**
 * SAN-1523 — the batch loop of the embedding worker, separated from Deno.serve so it can be tested with a
 * fake database and a fake Gemini. `db` only needs `rpc`, which both supabase-js and the test fake provide.
 */
import { clampLimit, embedDocument, EMBED_DIM, EMBED_MODEL, sanitizeReason, type EmbedOutcome } from "./embedding-worker.ts";

export type RpcResult = { data: unknown; error: { code?: string } | null };
export type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

export type ClaimedJob = {
  job_id: string;
  entity_type: string;
  entity_id: string;
  content_hash: string;
  model: string;
  dimensions: number;
  lease_token: string;
};

export type BatchSummary = {
  claimed: number; done: number; retry: number; failed: number; skipped: number; superseded: number; lost_lease: number;
};

export class ClaimFailedError extends Error {}

export async function processEmbeddingBatch(
  db: RpcClient,
  geminiKey: string,
  rawLimit: unknown,
  embed: (text: string, key: string) => Promise<EmbedOutcome> = embedDocument,
): Promise<BatchSummary> {
  const summary: BatchSummary = { claimed: 0, done: 0, retry: 0, failed: 0, skipped: 0, superseded: 0, lost_lease: 0 };
  const count = (outcome: unknown) => {
    const key = String(outcome) as keyof BatchSummary;
    summary[key in summary && key !== "claimed" ? key : "failed"]++;
  };

  const { data: jobs, error: claimError } = await db.rpc("claim_embedding_jobs", { p_limit: clampLimit(rawLimit) });
  if (claimError) throw new ClaimFailedError(claimError.code ?? "claim_failed");

  for (const job of (jobs ?? []) as ClaimedJob[]) {
    summary.claimed++;
    const fail = async (reason: string, retryable: boolean, skip = false) => {
      const { data } = await db.rpc("fail_embedding_job", {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_reason: sanitizeReason(reason),
        p_retryable: retryable,
        p_skip: skip,
      });
      count(data ?? "failed");
    };

    if (job.model !== EMBED_MODEL || job.dimensions !== EMBED_DIM) {
      await fail(`job asks for ${job.model}/${job.dimensions}, this worker serves ${EMBED_MODEL}/${EMBED_DIM}`, false);
      continue;
    }

    const { data: docs, error: docError } = await db.rpc("embedding_document_for_entity", {
      p_entity_type: job.entity_type,
      p_entity_id: job.entity_id,
    });
    if (docError) {
      await fail("could not read the document", true);
      continue;
    }
    const doc = (docs as { content_text: string }[] | null)?.[0];
    if (!doc) {
      await fail("entity no longer exists or has no text to embed", false, true);
      continue;
    }

    const embedded = await embed(doc.content_text, geminiKey);
    if (!embedded.ok) {
      await fail(embedded.reason, embedded.retryable);
      continue;
    }

    const { data: result, error: completeError } = await db.rpc("complete_embedding_job", {
      p_job_id: job.job_id,
      p_lease_token: job.lease_token,
      p_values: embedded.values,
    });
    if (completeError) {
      await fail(`could not store the embedding (${completeError.code ?? "error"})`, true);
      continue;
    }
    count(result);
  }
  return summary;
}
