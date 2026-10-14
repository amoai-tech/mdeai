/**
 * SAN-1444 P0 — process durably-claimed inbound messages exactly once per claim.
 *
 * A claimed row is replayed through the SAME adapter webhook using a single-message envelope
 * re-signed with the app secret. Duplicate deliveries never re-claim, so they cannot start a
 * second concierge run.
 *
 * LIMIT: preventing a duplicate agent run does NOT guarantee exactly one external WhatsApp
 * send. If the provider accepted a reply and the process then crashed before
 * whatsapp_complete_inbound committed, the row is retried and the reply is sent again. That
 * at-least-once boundary is deliberate and documented in docs/audits/san-1444-durable-inbound.md.
 */
import { claimInbound, completeInbound, failInbound, type ClaimedRow, type InboundRpcClient } from "./inbound-store";

export type AdapterWebhook = (request: Request) => Promise<Response>;

export type ProcessDeps = {
  client: InboundRpcClient;
  webhookUrl: string;
  sign: (body: string) => string;
  adapterWebhook: AdapterWebhook;
  workerId: string;
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
};

export type ProcessSummary = {
  claimed: number;
  processed: number;
  failed: number;
};

export async function processDueInbound(deps: ProcessDeps): Promise<ProcessSummary> {
  const rows = await claimInbound(
    deps.client,
    deps.workerId,
    deps.limit ?? 5,
    deps.leaseSeconds ?? 120,
  );
  const summary: ProcessSummary = { claimed: rows.length, processed: 0, failed: 0 };
  for (const row of rows) {
    await processRow(deps, row, summary);
  }
  return summary;
}

async function processRow(deps: ProcessDeps, row: ClaimedRow, summary: ProcessSummary): Promise<void> {
  if (!row.raw_payload) {
    await failInbound(deps.client, row.id, "missing raw_payload", deps.maxAttempts);
    summary.failed += 1;
    return;
  }
  try {
    const body = JSON.stringify(row.raw_payload);
    const response = await deps.adapterWebhook(
      new Request(deps.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": deps.sign(body),
        },
        body,
      }),
    );
    if (!response.ok) throw new Error("adapter webhook returned " + response.status);
    await completeInbound(deps.client, row.id);
    summary.processed += 1;
  } catch (error) {
    await failInbound(
      deps.client,
      row.id,
      error instanceof Error ? error.message : String(error),
      deps.maxAttempts,
    );
    summary.failed += 1;
  }
}
