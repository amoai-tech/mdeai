import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleWebhookEvent: vi.fn(async () => new Response("delegated", { status: 200 })),
  hasAdapter: vi.fn(() => true),
}));

vi.mock("@/mastra", () => ({
  mastra: {
    getAgent: () => ({
      getChannels: () => ({
        hasAdapter: mocks.hasAdapter,
        handleWebhookEvent: mocks.handleWebhookEvent,
      }),
    }),
  },
}));

import { GET, POST } from "../webhook/route";

const KEYS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"] as const;
const URL = "https://x.test/api/whatsapp/webhook";
const sign = (body: string) => "sha256=" + createHmac("sha256", "secret").update(body, "utf8").digest("hex");

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("WhatsApp webhook route", () => {
  it("returns 503 and constructs nothing when the channel is unconfigured", async () => {
    const get = await GET(new NextRequest(URL));
    const post = await POST(new NextRequest(URL, { method: "POST", body: "{}" }));
    expect(get.status).toBe(503);
    expect(post.status).toBe(503);
    expect(mocks.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it("delegates GET to the adapter when configured", async () => {
    for (const k of KEYS) process.env[k] = "set";
    const res = await GET(new NextRequest(URL + "?hub.mode=subscribe&hub.verify_token=set&hub.challenge=abc"));
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("delegates a validly signed POST", async () => {
    for (const k of KEYS) process.env[k] = "set";
    process.env.WHATSAPP_APP_SECRET = "secret";
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const res = await POST(new NextRequest(URL, { method: "POST", headers: { "x-hub-signature-256": sign(body) }, body }));
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects a forged signature before the adapter and does not delegate", async () => {
    for (const k of KEYS) process.env[k] = "set";
    process.env.WHATSAPP_APP_SECRET = "secret";
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const res = await POST(new NextRequest(URL, { method: "POST", headers: { "x-hub-signature-256": "sha256=deadbeef" }, body }));
    expect(res.status).toBe(401);
    expect(mocks.handleWebhookEvent).not.toHaveBeenCalled();
  });
});
