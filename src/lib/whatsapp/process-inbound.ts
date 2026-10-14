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
  completeInbound,
  deadLetterInbound,
  failInbound,
  type ClaimedRow,
  type InboundRpcClient,
} from "./inbound-store";

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
};

export type ProcessSummary = {
  claimed: number;
  processed: number;
  failed: number;
  stale: number;
  deadLettered: number;
};

const DEFAULT_EXECUTION_TIMEOUT_MS = 150_000;

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
    stale: 0,
    deadLettered: await deadLetterInbound(deps.client, maxAttempts, leaseSeconds),
  };
  const rows = await claimInbound(deps.client, deps.workerId, deps.limit ?? 5, leaseSeconds, maxAttempts);
  summary.claimed = rows.length;
  for (const row of rows) {
    await processRow(deps, row, summary, maxAttempts);
  }
  return summary;
}

async function processRow(
  deps: ProcessDeps,
  row: ClaimedRow,
  summary: ProcessSummary,
  maxAttempts: number,
): Promise<void> {
  if (row.raw_payload === null || row.raw_payload === undefined) {
    const failed = await failInbound(deps.client, row.id, row.claim_token, "missing raw_payload", maxAttempts);
    if (failed) summary.failed += 1;
    else summary.stale += 1;
    return;
  }
  try {
    const body = JSON.stringify(row.raw_payload);
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
    // The adapter must register the agent/reply work through waitUntil. If it does not, an
    // HTTP 200 means nothing: marking the row processed here would tell the sweeper never to
    // retry while the customer never receives a reply. Fail loudly and let it retry.
    if (!registered) {
      throw new Error("adapter did not register background work via waitUntil");
    }
    await withTimeout(registered, deps.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS, "agent run");
    const completed = await completeInbound(deps.client, row.id, row.claim_token);
    if (completed) summary.processed += 1;
    else summary.stale += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await failInbound(deps.client, row.id, row.claim_token, message, maxAttempts);
    if (failed) summary.failed += 1;
    else summary.stale += 1;
  }
}
