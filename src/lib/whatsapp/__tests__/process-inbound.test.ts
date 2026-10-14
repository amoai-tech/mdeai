import { describe, expect, it, vi } from "vitest";
import type { ClaimedRow, InboundRpcClient } from "../inbound-store";
import { bufferOutboundText, recordOutboundSend, setBufferedFlusher } from "../outbound-tracker";
import { processDueInbound } from "../process-inbound";

function row(id: string, overrides: Partial<ClaimedRow> = {}): ClaimedRow {
  return { id, external_id: "wamid." + id, phone_number: "57300", raw_payload: { object: "whatsapp_business_account", entry: [] }, attempts: 1, claim_token: "tok-" + id, ...overrides };
}

type RpcCall = { fn: string; args?: Record<string, unknown> };

function trackingClient(claims: ClaimedRow[][], results: { complete?: number; fail?: number; dead?: number; partial?: number } = {}) {
  const calls: RpcCall[] = [];
  let claimIndex = 0;
  const client: InboundRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === "whatsapp_claim_inbound") {
        const data = claims[claimIndex] ?? [];
        claimIndex += 1;
        return Promise.resolve({ data, error: null });
      }
      if (fn === "whatsapp_complete_inbound_with_sends") return Promise.resolve({ data: results.complete ?? 1, error: null });
      if (fn === "whatsapp_complete_inbound") return Promise.resolve({ data: results.complete ?? 1, error: null });
      if (fn === "whatsapp_record_partial_sends") return Promise.resolve({ data: results.partial ?? 1, error: null });
      if (fn === "whatsapp_fail_inbound") return Promise.resolve({ data: results.fail ?? 1, error: null });
      if (fn === "whatsapp_dead_letter_inbound") return Promise.resolve({ data: results.dead ?? 0, error: null });
      return Promise.resolve({ data: null, error: { message: "unexpected " + fn } });
    },
  };
  return { client, calls };
}

const sign = () => "sha256=test";
const base = { webhookUrl: "https://x/api/whatsapp/webhook", sign, workerId: "w1" };
const okAdapter = (_request: Request, waitUntil: (p: Promise<unknown>) => void) => {
  waitUntil(Promise.resolve());
  // A real adapter records the send through postMessage; the happy path must show one.
  recordOutboundSend({ success: true, providerMessageId: "wamid.sent", content: "reply" });
  return Promise.resolve(new Response("ok", { status: 200 }));
};

describe("processDueInbound", () => {
  it("processes a claimed row and marks it complete with its claim token", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn(okAdapter);
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ claimed: 1, processed: 1, failed: 0, stale: 0 });
    const complete = calls.find((c) => c.fn === "whatsapp_complete_inbound_with_sends");
    expect(complete?.args?.p_claim_token).toBe("tok-m1");
    expect(Array.isArray(complete?.args?.p_sends)).toBe(true);
  });

  it("does not count a row as processed when a newer worker owns the claim", async () => {
    const { client } = trackingClient([[row("m1")]], { complete: 0 });
    const summary = await processDueInbound({ ...base, client, adapterWebhook: vi.fn(okAdapter) });
    expect(summary).toMatchObject({ claimed: 1, processed: 0, stale: 1 });
  });

  it("waits for the agent work the adapter scheduled before completing", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      waitUntil(Promise.reject(new Error("agent failed")));
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, failed: 1 });
    expect(calls.find((c) => c.fn === "whatsapp_fail_inbound")?.args?.p_error).toContain("agent failed");
  });

  it("fails the row when the adapter acknowledges without registering any work", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, failed: 1 });
    expect(calls.find((c) => c.fn === "whatsapp_fail_inbound")?.args?.p_error).toContain("waitUntil");
  });

  it("fails the row when waitUntil receives a non-promise", async () => {
    const { client } = trackingClient([[row("m1")]]);
    const adapterWebhook = ((_req: Request, waitUntil: (p: unknown) => void) => {
      waitUntil("not-a-promise");
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as never;
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, failed: 1 });
  });

  it("fails a stuck agent run once the execution timeout is exceeded", async () => {
    const { client } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      waitUntil(new Promise(() => {}));
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook, executionTimeoutMs: 10 });
    expect(summary).toMatchObject({ processed: 0, failed: 1 });
  });

  it("marks a row failed when the adapter does not return ok", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const summary = await processDueInbound({ ...base, client, adapterWebhook: vi.fn(() => Promise.resolve(new Response("bad", { status: 500 }))) });
    expect(summary).toMatchObject({ processed: 0, failed: 1 });
    expect(calls.find((c) => c.fn === "whatsapp_fail_inbound")?.args?.p_error).toContain("500");
  });

  it("fails a row with no stored payload instead of silently dropping it", async () => {
    const { client, calls } = trackingClient([[row("m1", { raw_payload: null })]]);
    const adapterWebhook = vi.fn(okAdapter);
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary.failed).toBe(1);
    expect(adapterWebhook).not.toHaveBeenCalled();
    expect(calls.find((c) => c.fn === "whatsapp_fail_inbound")?.args?.p_error).toContain("missing raw_payload");
  });

  it("hands back claimed rows that cannot finish inside the batch budget", async () => {
    const { client, calls } = trackingClient([[row("m1"), row("m2")]]);
    const adapterWebhook = vi.fn(okAdapter);
    const summary = await processDueInbound({ ...base, client, adapterWebhook, batchDeadlineMs: 0 });
    expect(summary).toMatchObject({ claimed: 2, processed: 0, failed: 2 });
    expect(adapterWebhook).not.toHaveBeenCalled();
    expect(
      calls.filter((c) => c.fn === "whatsapp_fail_inbound" && c.args?.p_error === "batch deadline reached"),
    ).toHaveLength(2);
  });

  it("fails the row when the outbound send was rejected", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      recordOutboundSend({ success: false, error: "401 Invalid OAuth access token" });
      waitUntil(Promise.resolve());
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, failed: 1 });
    const failed = calls.find((c) => c.fn === "whatsapp_fail_inbound");
    expect(failed?.args?.p_error).toContain("no confirmed outbound send");
    expect(failed?.args?.p_error).toContain("Invalid OAuth access token");
  });

  it("posts one consolidated reply for the whole run", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const flusher = vi.fn(async () => {
      // The real flush goes through the adapter INSIDE the scope, so the interceptor records it.
      recordOutboundSend({ success: true, providerMessageId: "wamid.final", content: "Found 3" });
      return "wamid.final";
    });
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      bufferOutboundText("thread", "I'll check those apartments");
      bufferOutboundText("thread", "Found 3: A COP 2.9M, B COP 3.2M, C COP 3.4M");
      setBufferedFlusher(flusher);
      waitUntil(Promise.resolve());
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(flusher).toHaveBeenCalledTimes(1);
    expect(flusher).toHaveBeenCalledWith("thread", "Found 3: A COP 2.9M, B COP 3.2M, C COP 3.4M");
    expect(summary).toMatchObject({ processed: 1 });
    expect(calls.some((c) => c.fn === "whatsapp_complete_inbound_with_sends")).toBe(true);
  });

  it("never marks a partial reply as processed", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      recordOutboundSend({ success: true, providerMessageId: "wamid.ok", content: "part one" });
      recordOutboundSend({ success: false, error: "401 on the second chunk" });
      waitUntil(Promise.resolve());
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, partial: 1, failed: 0 });
    const partial = calls.find((c) => c.fn === "whatsapp_record_partial_sends");
    expect(partial?.args?.p_error).toContain("partial outbound send");
    // The confirmed chunk is persisted, and the row is NOT blindly failed into a duplicate retry.
    expect(Array.isArray(partial?.args?.p_sends)).toBe(true);
    expect(calls.some((c) => c.fn === "whatsapp_fail_inbound")).toBe(false);
  });

  it("keeps an accepted chunk when the adapter throws on the next chunk", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      bufferOutboundText("thread", "long answer");
      setBufferedFlusher(async () => {
        // Meta accepted the first chunk, then the adapter THREW on the second (non-2xx).
        recordOutboundSend({ success: true, providerMessageId: "wamid.chunk1", content: "long answer" });
        throw new Error("Meta 401 on the second chunk");
      });
      waitUntil(Promise.resolve());
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, partial: 1, failed: 0 });
    const partial = calls.find((c) => c.fn === "whatsapp_record_partial_sends");
    expect(partial?.args?.p_error).toContain("Meta 401 on the second chunk");
    expect(JSON.stringify(partial?.args?.p_sends)).toContain("wamid.chunk1");
    // Never blindly failed into a duplicating retry.
    expect(calls.some((c) => c.fn === "whatsapp_fail_inbound")).toBe(false);
  });

  it("retries when the adapter throws before Meta accepted anything", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      bufferOutboundText("thread", "long answer");
      setBufferedFlusher(async () => {
        throw new Error("Meta 401");
      });
      waitUntil(Promise.resolve());
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, partial: 0, failed: 1 });
    expect(calls.find((c) => c.fn === "whatsapp_fail_inbound")?.args?.p_error).toContain(
      "no confirmed outbound send",
    );
  });

  it("persists every chunk when all of them are accepted", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      bufferOutboundText("thread", "long answer");
      setBufferedFlusher(async () => {
        recordOutboundSend({ success: true, providerMessageId: "wamid.a", content: "part a" });
        recordOutboundSend({ success: true, providerMessageId: "wamid.b", content: "part b" });
        return "wamid.b";
      });
      waitUntil(Promise.resolve());
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 1 });
    const sends = JSON.stringify(
      calls.find((c) => c.fn === "whatsapp_complete_inbound_with_sends")?.args?.p_sends,
    );
    expect(sends).toContain("wamid.a");
    expect(sends).toContain("wamid.b");
  });

  it("fails the row when the agent settled without sending anything", async () => {
    const { client, calls } = trackingClient([[row("m1")]]);
    const adapterWebhook = vi.fn((_req: Request, waitUntil: (p: Promise<unknown>) => void) => {
      waitUntil(Promise.resolve());
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ processed: 0, failed: 1 });
    expect(calls.find((c) => c.fn === "whatsapp_fail_inbound")?.args?.p_error).toContain(
      "no confirmed outbound send",
    );
  });

  it("dead-letters exhausted work before claiming", async () => {
    const { client, calls } = trackingClient([[]], { dead: 2 });
    const summary = await processDueInbound({ ...base, client, adapterWebhook: vi.fn(okAdapter) });
    expect(summary).toMatchObject({ claimed: 0, deadLettered: 2 });
    expect(calls[0].fn).toBe("whatsapp_dead_letter_inbound");
  });

  it("does nothing when no work is due", async () => {
    const { client } = trackingClient([[]]);
    const adapterWebhook = vi.fn(okAdapter);
    const summary = await processDueInbound({ ...base, client, adapterWebhook });
    expect(summary).toMatchObject({ claimed: 0, processed: 0, failed: 0, stale: 0 });
    expect(adapterWebhook).not.toHaveBeenCalled();
  });

  it("two concurrent workers process their own disjoint claims exactly once each", async () => {
    const a = trackingClient([[row("m1"), row("m2")]]);
    const b = trackingClient([[row("m3")]]);
    const adapterWebhook = vi.fn(okAdapter);
    const [sa, sb] = await Promise.all([
      processDueInbound({ ...base, client: a.client, adapterWebhook, workerId: "w1" }),
      processDueInbound({ ...base, client: b.client, adapterWebhook, workerId: "w2" }),
    ]);
    expect(sa.processed + sb.processed).toBe(3);
    const completed = [...a.calls, ...b.calls].filter(
      (c) => c.fn === "whatsapp_complete_inbound_with_sends",
    );
    expect(new Set(completed.map((c) => c.args?.p_message_id)).size).toBe(3);
  });
});
