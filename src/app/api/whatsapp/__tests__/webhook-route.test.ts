import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signMetaBody, TEST_APP_SECRET } from "@/lib/whatsapp/__tests__/test-signing";
import { MAX_WEBHOOK_BYTES } from "@/lib/whatsapp/webhook-security";

const mocks = vi.hoisted(() => ({
  handleWebhookEvent: vi.fn(() => Promise.resolve(new Response("delegated", { status: 200 }))),
  hasAdapter: vi.fn(() => true),
  createServiceRoleClient: vi.fn(),
  processDueInbound: vi.fn(() => Promise.resolve({ claimed: 0, processed: 0, failed: 0 })),
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
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/whatsapp/process-inbound", () => ({
  processDueInbound: mocks.processDueInbound,
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn(() => {}) };
});

import { GET, POST } from "../webhook/route";

const URL = "https://x.test/api/whatsapp/webhook";
const payload = (messages: unknown[]) => JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: "1" }, messages } }] }],
});
const text = [{ id: "wamid.1", from: "57300", type: "text", text: { body: "hola" } }];

function configure(): void {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
  vi.stubEnv("WHATSAPP_APP_SECRET", TEST_APP_SECRET);
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify");
}
function signedRequest(body: string): NextRequest {
  return new NextRequest(URL, { method: "POST", headers: { "x-hub-signature-256": signMetaBody(body) }, body });
}
function rpcReturning(result: unknown) {
  return { rpc: vi.fn(() => Promise.resolve(result)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("WhatsApp webhook route", () => {
  it("returns 503 and constructs nothing when unconfigured", async () => {
    expect((await GET(new NextRequest(URL))).status).toBe(503);
    expect((await POST(new NextRequest(URL, { method: "POST", body: "{}" }))).status).toBe(503);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("delegates GET to the adapter when configured", async () => {
    configure();
    const res = await GET(new NextRequest(URL + "?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=abc"));
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("records a new inbound message before acknowledging", async () => {
    configure();
    mocks.createServiceRoleClient.mockReturnValue(rpcReturning({ data: [{ message_id: "m1", is_new: true }], error: null }));
    const res = await POST(signedRequest(payload(text)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1, duplicates: 0 });
  });

  it("acknowledges a duplicate delivery without recording new work", async () => {
    configure();
    mocks.createServiceRoleClient.mockReturnValue(rpcReturning({ data: [{ message_id: "m1", is_new: false }], error: null }));
    const res = await POST(signedRequest(payload(text)));
    expect(await res.json()).toEqual({ received: 0, duplicates: 1 });
  });

  it("does NOT acknowledge when the durable record fails", async () => {
    configure();
    mocks.createServiceRoleClient.mockReturnValue(rpcReturning({ data: null, error: { message: "db down" } }));
    const res = await POST(signedRequest(payload(text)));
    expect(res.status).toBe(500);
  });

  it("rejects a forged signature before touching the database", async () => {
    configure();
    mocks.createServiceRoleClient.mockReturnValue(rpcReturning({ data: null, error: null }));
    const res = await POST(new NextRequest(URL, {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: payload(text),
    }));
    expect(res.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("rejects an oversized payload with 413", async () => {
    configure();
    mocks.createServiceRoleClient.mockReturnValue(rpcReturning({ data: null, error: null }));
    const request = new NextRequest(URL, { method: "POST", headers: { "x-hub-signature-256": "sha256=deadbeef" }, body: "{}" });
    request.headers.set("content-length", String(MAX_WEBHOOK_BYTES + 1));
    expect((await POST(request)).status).toBe(413);
  });

  it("persists a delivery status callback without recording inbound work", async () => {
    configure();
    const rpc = vi.fn<(fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>(
      async () => ({ data: 1, error: null }),
    );
    mocks.createServiceRoleClient.mockReturnValue({ rpc });
    const statusOnly = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1" }, statuses: [{ id: "wamid.1", status: "read", timestamp: "1700000000" }] } }] }],
    });
    const res = await POST(signedRequest(statusOnly));
    expect(await res.json()).toEqual({ statuses: 1, received: 0, duplicates: 0 });
    expect(rpc.mock.calls.some((c) => c[0] === "whatsapp_record_delivery_status")).toBe(true);
    expect(rpc.mock.calls.some((c) => c[0] === "whatsapp_record_inbound")).toBe(false);
  });
});
