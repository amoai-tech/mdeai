import { beforeAll, describe, expect, it } from "vitest";
import {
  confirmedSends,
  installWhatsAppSendInterceptor,
  isTrackingOutbound,
  recordOutboundSend,
  runWithOutboundTracking,
  sendOutcome,
} from "../outbound-tracker";

// Install once, over a body-driven mock: the interceptor captures global fetch at install time.
beforeAll(() => {
  let index = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    if (body.includes("fail")) {
      return new Response(JSON.stringify({ error: { message: "401 no" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    index += 1;
    return new Response(JSON.stringify({ messages: [{ id: "wamid." + index }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  installWhatsAppSendInterceptor();
});

const metaSend = (text: string, method = "POST") =>
  fetch("https://graph.facebook.com/v25.0/123456/messages", {
    method,
    body: JSON.stringify({ messaging_product: "whatsapp", text: { body: text } }),
  });

describe("outbound tracker", () => {
  it("collects the sends made inside a scope", async () => {
    const { result, sends } = await runWithOutboundTracking(async () => {
      expect(isTrackingOutbound()).toBe(true);
      recordOutboundSend({ success: true, providerMessageId: "wamid.1", content: "one" });
      recordOutboundSend({ success: false, error: "boom" });
      return "done";
    });
    expect(result).toBe("done");
    expect(sends).toEqual([
      { success: true, providerMessageId: "wamid.1", content: "one" },
      { success: false, error: "boom" },
    ]);
  });

  it("is a no-op outside a scope so normal sends are untouched", () => {
    expect(isTrackingOutbound()).toBe(false);
    expect(() => recordOutboundSend({ success: true, providerMessageId: null, content: "" })).not.toThrow();
  });

  it("keeps every accepted send with an id, and drops failures or id-less sends", () => {
    const confirmed = confirmedSends([
      { success: true, providerMessageId: "wamid.1", content: "one" },
      { success: true, providerMessageId: "wamid.2", content: "two" },
      { success: true, providerMessageId: null, content: "no id" },
      { success: false, error: "boom" },
    ]);
    expect(confirmed).toEqual([
      { wamid: "wamid.1", content: "one" },
      { wamid: "wamid.2", content: "two" },
    ]);
  });

  it("classifies full, partial and failed send sets", () => {
    const ok = (id: string) => ({ success: true as const, providerMessageId: id, content: "" });
    const bad = { success: false as const, error: "boom" };
    expect(sendOutcome([ok("w1"), ok("w2")])).toBe("full");
    expect(sendOutcome([ok("w1"), bad])).toBe("partial");
    expect(sendOutcome([bad])).toBe("failed");
    expect(sendOutcome([])).toBe("failed");
  });

  it("records every physical send, but ignores unrelated and non-POST requests", async () => {
    const { sends } = await runWithOutboundTracking(async () => {
      await metaSend("chunk one");
      await metaSend("chunk two");
      await metaSend("fail chunk");
      // Not the Meta messages endpoint.
      await fetch("https://example.com/not-meta", { method: "POST", body: "{}" });
      // Right endpoint, wrong method (a status read must never look like a send).
      await metaSend("status read", "GET");
    });

    expect(sends).toHaveLength(3);
    expect(sends[0]).toMatchObject({ success: true, content: "chunk one" });
    expect(sends[1]).toMatchObject({ success: true, content: "chunk two" });
    expect(sends[2]).toMatchObject({ success: false, error: "401 no" });
  });

  it("keeps concurrent worker scopes isolated from each other", async () => {
    const run = (tag: string, count: number) =>
      runWithOutboundTracking(async () => {
        for (let i = 0; i < count; i += 1) await metaSend(tag + "-" + i);
      });
    const [a, b] = await Promise.all([run("A", 2), run("B", 3)]);
    expect(a.sends).toHaveLength(2);
    expect(b.sends).toHaveLength(3);
    expect(a.sends.every((s) => s.success === true && s.content.startsWith("A-"))).toBe(true);
    expect(b.sends.every((s) => s.success === true && s.content.startsWith("B-"))).toBe(true);
  });

  it("does not leak sends between scopes", async () => {
    await runWithOutboundTracking(async () => {
      recordOutboundSend({ success: true, providerMessageId: "a", content: "a" });
    });
    const { sends } = await runWithOutboundTracking(async () => {});
    expect(sends).toEqual([]);
  });
});
