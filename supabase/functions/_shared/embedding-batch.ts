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
  /** the database call that records a failure itself failed: the lease will expire and the job be reclaimed */
  unrecorded: number;
  /** set when the whole run stopped because of a configuration problem, not a bad record */
  halted?: "gemini_auth" | "gemini_configuration";
  /** claimed jobs handed back unspent because the run reached its time budget (normal, they run next tick) */
  deferred: number;
};

/**
 * Supabase Edge Functions must answer within 150 s (docs: Limits, request idle timeout). A job can take up to
 * the 20 s Gemini timeout, so stop STARTING new jobs after 90 s: the last one still ends well inside the limit.
 */
export const TIME_BUDGET_MS = 90_000;

export class ClaimFailedError extends Error {}

export async function processEmbeddingBatch(
  db: RpcClient,
  geminiKey: string,
  rawLimit: unknown,
  embed: (text: string, key: string) => Promise<EmbedOutcome> = embedDocument,
  now: () => number = Date.now,
  budgetMs: number = TIME_BUDGET_MS,
): Promise<BatchSummary> {
  const started = now();
  const summary: BatchSummary = {
    claimed: 0, done: 0, retry: 0, failed: 0, skipped: 0, superseded: 0, lost_lease: 0, unrecorded: 0, deferred: 0,
  };
  const OUTCOMES = ["done", "retry", "failed", "skipped", "superseded", "lost_lease"] as const;
  const count = (outcome: unknown) => {
    const key = OUTCOMES.find((o) => o === outcome);
    if (key) summary[key]++;
    else summary.unrecorded++; // an unexpected answer is not a success and not a recorded failure
  };

  const { data: jobs, error: claimError } = await db.rpc("claim_embedding_jobs", { p_limit: clampLimit(rawLimit) });
  if (claimError) throw new ClaimFailedError(claimError.code ?? "claim_failed");

  const claimedJobs = (jobs ?? []) as ClaimedJob[];
  summary.claimed = claimedJobs.length;
  for (const [index, job] of claimedJobs.entries()) {
    // refund: the attempt was spent on a configuration problem, not on this record
    const fail = async (reason: string, retryable: boolean, skip = false, refund = false, target = job) => {
      const { data, error } = await db.rpc("fail_embedding_job", {
        p_job_id: target.job_id,
        p_lease_token: target.lease_token,
        p_reason: sanitizeReason(reason),
        p_retryable: retryable,
        p_skip: skip,
        p_refund_attempt: refund,
      });
      if (error) summary.unrecorded++;
      else count(data);
    };

    if (index > 0 && now() - started > budgetMs) {
      // Out of time: give the rest back with their attempt refunded; the next tick picks them up.
      summary.deferred = claimedJobs.length - index;
      for (const waiting of claimedJobs.slice(index)) await fail("run time budget reached", true, false, true, waiting);
      break;
    }

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
    if (!embedded.ok && embedded.fatal) {
      // A rejected key, billing problem or missing model affects every record: refund the claims and stop.
      summary.halted = embedded.haltReason ?? "gemini_auth";
      for (const waiting of claimedJobs.slice(index)) await fail(embedded.reason, true, false, true, waiting);
      break;
    }
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

/**
 * The HTTP status the scheduler will see. 200 means every outcome was recorded; a run that could not record
 * a failure (502) or was stopped by a configuration problem (503) must not look like a success.
 */
export function statusForSummary(summary: BatchSummary): number {
  if (summary.halted) return 503;
  return summary.unrecorded > 0 ? 502 : 200;
}
