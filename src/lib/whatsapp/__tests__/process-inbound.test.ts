import { describe, expect, it, vi } from "vitest";
import type { ClaimedRow, InboundRpcClient } from "../inbound-store";
import { processDueInbound } from "../process-inbound";

function row(id: string, overrides: Partial<ClaimedRow> = {}): ClaimedRow {
  return { id, external_id: "wamid." + id, phone_number: "57300", raw_payload: { object: "whatsapp_business_account", entry: [] }, attempts: 1, ...overrides };
}

function trackingClient(claims: ClaimedRow[][]) {
  const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  let claimIndex = 0;
  const client: InboundRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === "whatsapp_claim_inbound") {
        const data = claims[claimIndex] ?? [];
        claimIndex += 1;
        return Promise.resolve({ data, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { client, calls };
}

const sign = () => "sha256=test";

describe("processDueInbound", () => {
  it("processes a claimed row and marks it complete", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));
    const summary = await processDueInbound({ client, webhookUrl: "https://x/api/whatsapp/webhook", sign, adapterWebhook, workerId: "w1" });
    expect(summary).toEqual({ claimed: 1, processed: 1, failed: 0 });
    expect(adapterWebhook).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.fn)).toContain("whatsapp_complete_inbound");
    expect(calls.map((c) => c.fn)).not.toContain("whatsapp_fail_inbound");
  });

  it("marks a row failed when the adapter does not return ok", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn(() => Promise.resolve(new Response("bad", { status: 500 })));
    const summary = await processDueInbound({ client, webhookUrl: "https://x", sign, adapterWebhook, workerId: "w1" });
    expect(summary).toEqual({ claimed: 1, processed: 0, failed: 1 });
    const failedCall = calls.find((c) => c.fn === "whatsapp_fail_inbound");
    expect(failedCall?.args?.p_error).toContain("500");
  });

  it("fails a row that has no stored payload instead of silently dropping it", async () => {
    const { client, calls } = trackingClient([[row("m1", { raw_payload: null })]]);
    const adapterWebhook = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));
    const summary = await processDueInbound({ client, webhookUrl: "https://x", sign, adapterWebhook, workerId: "w1" });
    expect(summary.failed).toBe(1);
    expect(adapterWebhook).not.toHaveBeenCalled();
    expect(calls.find((c) => c.fn === "whatsapp_fail_inbound")?.args?.p_error).toContain("missing raw_payload");
  });

  it("does nothing when no work is due", async () => {
    const { client } = trackingClient([[]]);
    const adapterWebhook = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));
    const summary = await processDueInbound({ client, webhookUrl: "https://x", sign, adapterWebhook, workerId: "w1" });
    expect(summary).toEqual({ claimed: 0, processed: 0, failed: 0 });
    expect(adapterWebhook).not.toHaveBeenCalled();
  });

  it("two concurrent workers process their own disjoint claims exactly once each", async () => {
    const a = trackingClient([[row("m1"), row("m2")]]);
    const b = trackingClient([[row("m3")]]);
    const adapterWebhook = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));
    const [sa, sb] = await Promise.all([
      processDueInbound({ client: a.client, webhookUrl: "https://x", sign, adapterWebhook, workerId: "w1" }),
      processDueInbound({ client: b.client, webhookUrl: "https://x", sign, adapterWebhook, workerId: "w2" }),
    ]);
    expect(sa.processed + sb.processed).toBe(3);
    const completed = [...a.calls, ...b.calls].filter((c) => c.fn === "whatsapp_complete_inbound");
    expect(new Set(completed.map((c) => c.args?.p_message_id)).size).toBe(3);
  });
});
