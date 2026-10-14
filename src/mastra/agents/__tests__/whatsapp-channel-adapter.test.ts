/**
 * SAN-1444 — proves the installed WhatsApp adapter's signed-ingress contract and the
 * in-process Mastra mount, without Meta credentials.
 *
 * The adapter is the transport owner; this test pins the contract MDE relies on at the
 * version actually installed (4.41.1), so an upgrade that changes it fails here first.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";

// Keep the adapter's initialization away from the public Graph API in tests.
process.env.WHATSAPP_API_URL = "http://127.0.0.1:1/";

const creds = {
  accessToken: "test-token",
  appSecret: "test-secret",
  phoneNumberId: "123456",
  verifyToken: "verify-me",
  userName: "mde",
};
const BASE = "https://x.test/api/whatsapp/webhook";
const sign = (body: string, secret = "test-secret") =>
  "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

const statusPayload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "W", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "123456" },
    statuses: [{ id: "wamid.X", status: "delivered", recipient_id: "57" }],
  } }] }],
});

const post = (adapter: ReturnType<typeof createWhatsAppAdapter>, body: string, signature: string | null) =>
  adapter.handleWebhook(new Request(BASE, {
    method: "POST",
    headers: signature
      ? { "x-hub-signature-256": signature, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body,
  }));

describe("@chat-adapter/whatsapp ingress contract", () => {
  const adapter = createWhatsAppAdapter(creds);

  it("GET echoes hub.challenge on a matching verify token", async () => {
    const res = await adapter.handleWebhook(new Request(BASE + "?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=chal123"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("chal123");
  });

  it("GET refuses a mismatched verify token", async () => {
    const res = await adapter.handleWebhook(new Request(BASE + "?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=chal123"));
    expect(res.status).toBe(403);
  });

  it("POST accepts a valid X-Hub-Signature-256 over the raw body", async () => {
    const res = await post(adapter, statusPayload, sign(statusPayload));
    expect(res.status).toBe(200);
  });

  it("POST accepts a UTF-8 body signed over raw bytes", async () => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "123456" }, statuses: [{ id: "wamid.é", status: "read" }],
    } }] }] });
    const res = await post(adapter, body, sign(body));
    expect(res.status).toBe(200);
  });

  it("POST rejects forged and missing signatures", async () => {
    expect((await post(adapter, statusPayload, sign(statusPayload, "wrong-secret"))).status).toBe(401);
    expect((await post(adapter, statusPayload, null)).status).toBe(401);
  });

  it("POST rejects malformed JSON even with a valid signature", async () => {
    const body = "{oops";
    expect((await post(adapter, body, sign(body))).status).toBe(400);
  });

  it("refuses to construct without the full credential set", () => {
    expect(() => createWhatsAppAdapter({ accessToken: "a", appSecret: "b", phoneNumberId: "c" })).toThrow();
  });
});

describe("Mastra in-process channel mount", () => {
  it("answers the challenge through agent.getChannels().handleWebhookEvent", async () => {
    const { Agent } = await import("@mastra/core/agent");
    const { Mastra } = await import("@mastra/core/mastra");
    const agent = new Agent({
      id: "wa-mount-agent",
      name: "WA Mount Agent",
      instructions: "test",
      model: "google/gemini-2.0-flash",
      channels: { adapters: { whatsapp: createWhatsAppAdapter(creds) } },
    });
    const channels = agent.getChannels();
    expect(channels?.hasAdapter("whatsapp")).toBe(true);
    new Mastra({ agents: { waMountAgent: agent } });
    const res = await channels!.handleWebhookEvent(
      "whatsapp",
      new Request(BASE + "?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=mnt456"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("mnt456");
  });
});
