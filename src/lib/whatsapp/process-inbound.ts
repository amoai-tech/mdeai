/**
 * SAN-1444 P0 — process durably-claimed inbound messages.
 *
 * Completion is tied to ACTUAL processing, not to the webhook HTTP status: the adapter receives
 * a waitUntil callback, and we await the promise it hands back (bounded by a timeout) before
 * marking the row processed. Mastra acknowledges the webhook before the agent finishes, so an
 * HTTP 200 alone is not proof that the customer received an answer.
 *
 * Fencing: completion and failure carry the row's claim_token. If the lease expired and another
 * worker claimed the row, the update affects 0 rows and we report it as stale instead of
 * pretending the work is done.
 *
 * LIMIT: this is at-least-once for external sends. If the provider accepted a reply and the
 * process died before completing, the retry sends again. Documented in the audit doc.
 */
import {
  claimInbound,
  completeInboundWithSends,
  deadLetterInbound,
  failInbound,
  recordPartialSends,
  type ClaimedRow,
  type InboundRpcClient,
} from "./inbound-store";
import {
  confirmedSends,
  flushBufferedReply,
  recordOutboundSend,
  runWithOutboundTracking,
  sendOutcome,
} from "./outbound-tracker";

export type AdapterWebhook = (
  request: Request,
  waitUntil: (promise: Promise<unknown>) => void,
) => Promise<Response>;

export type ProcessDeps = {
  client: InboundRpcClient;
  webhookUrl: string;
  sign: (body: string) => string;
  adapterWebhook: AdapterWebhook;
  workerId: string;
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  executionTimeoutMs?: number;
  /** Total wall-clock budget for one batch, so it cannot exceed the route's maxDuration. */
  batchDeadlineMs?: number;
};

export type ProcessSummary = {
  claimed: number;
  processed: number;
  failed: number;
  /** Replies where only some physical sends succeeded (terminal, operator-visible). */
  partial: number;
  stale: number;
  deadLettered: number;
};

const DEFAULT_EXECUTION_TIMEOUT_MS = 120_000;
const DEFAULT_BATCH_DEADLINE_MS = 240_000;

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

async function withTimeout(promise: Promise<unknown>, ms: number, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(label + " exceeded " + ms + "ms")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function processDueInbound(deps: ProcessDeps): Promise<ProcessSummary> {
  const maxAttempts = deps.maxAttempts ?? 5;
  const leaseSeconds = deps.leaseSeconds ?? 180;
  const summary: ProcessSummary = {
    claimed: 0,
    processed: 0,
    failed: 0,
    partial: 0,
    stale: 0,
    deadLettered: await deadLetterInbound(deps.client, maxAttempts, leaseSeconds),
  };
  const rows = await claimInbound(deps.client, deps.workerId, deps.limit ?? 5, leaseSeconds, maxAttempts);
  summary.claimed = rows.length;
  const startedAt = Date.now();
  const executionTimeoutMs = deps.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
  const batchDeadlineMs = deps.batchDeadlineMs ?? DEFAULT_BATCH_DEADLINE_MS;
  for (const row of rows) {
    // Never start a row that could run past the batch budget; hand it back to be retried by the
    // next run rather than being killed mid-send when the platform reaps the function.
    if (Date.now() - startedAt + executionTimeoutMs > batchDeadlineMs) {
      const released = await failInbound(deps.client, row.id, row.claim_token, "batch deadline reached", maxAttempts);
      if (released) summary.failed += 1;
      else summary.stale += 1;
      continue;
    }
    await processRow(deps, row, summary, maxAttempts, executionTimeoutMs);
  }
  return summary;
}

async function processRow(
  deps: ProcessDeps,
  row: ClaimedRow,
  summary: ProcessSummary,
  maxAttempts: number,
  executionTimeoutMs: number,
): Promise<void> {
  if (row.raw_payload === null || row.raw_payload === undefined) {
    const failed = await failInbound(deps.client, row.id, row.claim_token, "missing raw_payload", maxAttempts);
    if (failed) summary.failed += 1;
    else summary.stale += 1;
    return;
  }
  try {
    const body = JSON.stringify(row.raw_payload);
    // Track outbound sends for THIS message. The Chat SDK resolves the waitUntil task even when
    // the agent or the Meta send fails, so "the task settled" is not proof of delivery.
    const { sends } = await runWithOutboundTracking(async () => {
      let registered: Promise<unknown> | null = null;
      const response = await deps.adapterWebhook(
        new Request(deps.webhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": deps.sign(body),
          },
          body,
        }),
        (promise) => {
          registered = isPromise(promise)
            ? promise
            : Promise.reject(new Error("adapter passed a non-promise to waitUntil"));
        },
      );
      if (!response.ok) throw new Error("adapter webhook returned " + response.status);
      // The adapter must register the agent/reply work through waitUntil; an HTTP 200 that
      // registers nothing would let the sweeper skip a message the customer never got answered.
      if (!registered) {
        throw new Error("adapter did not register background work via waitUntil");
      }
      await withTimeout(registered, executionTimeoutMs, "agent run");
      // Post the run's final reply exactly once, INSIDE the scope: the adapter may split a long
      // answer across several Meta calls, and every physical send must be observed and linked.
      // The adapter THROWS on a non-2xx response, so catch it here: a chunk Meta already accepted
      // must still be persisted (partial) instead of losing the run to a blind, duplicating retry.
      try {
        await flushBufferedReply();
      } catch (error) {
        recordOutboundSend({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Completing requires EVERY physical send to succeed with a provider id, recorded in the SAME
    // transaction as the completion. A partial reply (some chunks sent, some failed) must never
    // look like a complete answer, and a missing wamid must never be a false success.
    const outcome = sendOutcome(sends);
    if (outcome === "partial") {
      // Persist what DID go out, then dead-letter: the customer received a partial reply and an
      // operator must see it. Blind retry would duplicate the chunks that already sent.
      const failure = sends.find((send) => send.success === false);
      const reason =
        "partial outbound send: " +
        (failure && failure.success === false ? failure.error : "some messages failed");
      const recordedPartial = await recordPartialSends(
        deps.client,
        row.id,
        row.claim_token,
        confirmedSends(sends),
        reason,
      );
      summary.partial += 1;
      console.error("[whatsapp] partial outbound send recorded", {
        externalId: row.external_id,
        sendsRecorded: recordedPartial,
      });
      return;
    }
    if (outcome === "failed") {
      const failure = sends.find((send) => send.success === false);
      throw new Error(
        "no confirmed outbound send: " +
          (failure && failure.success === false ? failure.error : "the agent produced no reply"),
      );
    }
    const sendsToRecord = confirmedSends(sends);

    const recorded = await completeInboundWithSends(
      deps.client,
      row.id,
      row.claim_token,
      sendsToRecord,
    );
    if (recorded > 0) {
      summary.processed += 1;
      console.info("[whatsapp] inbound processed", {
        externalId: row.external_id,
        providerMessageIds: sendsToRecord.map((send) => send.wamid),
      });
    } else {
      summary.stale += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await failInbound(deps.client, row.id, row.claim_token, message, maxAttempts);
    if (failed) summary.failed += 1;
    else summary.stale += 1;
  }
}
