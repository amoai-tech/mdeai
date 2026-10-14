import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signMetaBody, TEST_APP_SECRET } from "@/lib/whatsapp/__tests__/test-signing";

const mocks = vi.hoisted(() => ({
  handleWebhookEvent: vi.fn(() => Promise.resolve(new Response("delegated", { status: 200 }))),
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

const URL = "https://x.test/api/whatsapp/webhook";

function configure(): void {
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_APP_SECRET = TEST_APP_SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
  process.env.WHATSAPP_VERIFY_TOKEN = "verify";
}

function clearEnv(): void {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearEnv();
});
afterEach(clearEnv);

describe("WhatsApp webhook route", () => {
  it("returns 503 and constructs nothing when the channel is unconfigured", async () => {
    const get = await GET(new NextRequest(URL));
    const post = await POST(new NextRequest(URL, { method: "POST", body: "{}" }));
    expect(get.status).toBe(503);
    expect(post.status).toBe(503);
    expect(mocks.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it("delegates GET to the adapter when configured", async () => {
    configure();
    const res = await GET(new NextRequest(URL + "?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=abc"));
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("delegates a validly signed POST", async () => {
    configure();
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const res = await POST(new NextRequest(URL, {
      method: "POST",
      headers: { "x-hub-signature-256": signMetaBody(body) },
      body,
    }));
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects a forged signature before the adapter and does not delegate", async () => {
    configure();
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const res = await POST(new NextRequest(URL, {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body,
    }));
    expect(res.status).toBe(401);
    expect(mocks.handleWebhookEvent).not.toHaveBeenCalled();
  });
});
