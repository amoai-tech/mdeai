import { describe, expect, it, vi } from "vitest";
import {
  buildSingleMessageEnvelope,
  claimInbound,
  completeInbound,
  extractInboundMessages,
  failInbound,
  recordInboundMessage,
  type InboundRpcClient,
} from "../inbound-store";

const envelope = (messages: unknown[], metadata = { phone_number_id: "123" }) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "W", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata, messages } }] }],
});

describe("extractInboundMessages", () => {
  it("extracts a text message with a single-message replay envelope", () => {
    const payload = envelope([{ id: "wamid.IN", from: "57300", type: "text", text: { body: "hola" } }]);
    const [message] = extractInboundMessages(payload);
    expect(message.providerMessageId).toBe("wamid.IN");
    expect(message.from).toBe("57300");
    expect(message.messageType).toBe("text");
    expect(message.content).toBe("hola");
    const replayed = message.payload as { entry: Array<{ changes: Array<{ value: { messages: unknown[] } }> }> };
    expect(replayed.entry[0].changes[0].value.messages).toHaveLength(1);
  });

  it("ignores non-message fields, malformed entries and status-only payloads", () => {
    expect(extractInboundMessages(null)).toEqual([]);
    expect(extractInboundMessages({ object: "page" })).toEqual([]);
    expect(extractInboundMessages(envelope([], { phone_number_id: "1" }))).toEqual([]);
    expect(extractInboundMessages({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "account_update" }] }] })).toEqual([]);
    expect(extractInboundMessages(envelope([{ type: "text" }]))).toEqual([]);
  });

  it("keeps non-text messages with empty content", () => {
    const [message] = extractInboundMessages(envelope([{ id: "wamid.IMG", from: "57300", type: "image" }]));
    expect(message.messageType).toBe("image");
    expect(message.content).toBe("");
  });
});

describe("buildSingleMessageEnvelope", () => {
  it("scopes the envelope to exactly one message", () => {
    const built = buildSingleMessageEnvelope(
      envelope([{ id: "a" }, { id: "b" }]),
      { id: "a", from: "1" },
    ) as { entry: Array<{ changes: Array<{ value: { messages: Array<{ id: string }> } }> }> };
    expect(built.entry[0].changes[0].value.messages).toEqual([{ id: "a", from: "1" }]);
  });
});

type RpcHandler = (args: Record<string, unknown> | undefined) => { data: unknown; error: { message: string } | null };

function fakeClient(handlers: Map<string, RpcHandler>): InboundRpcClient {
  return {
    rpc: vi.fn((fn: string, args?: Record<string, unknown>) => {
      const handler = handlers.get(fn);
      if (!handler) return Promise.resolve({ data: null, error: { message: "unexpected " + fn } });
      return Promise.resolve(handler(args));
    }),
  };
}

describe("recordInboundMessage", () => {
  const message = { providerMessageId: "wamid.1", from: "57300", messageType: "text", content: "hi", payload: {} };

  it("returns the id and is_new flag", async () => {
    const client = fakeClient(new Map([["whatsapp_record_inbound", () => ({ data: [{ message_id: "m1", is_new: true }], error: null })]]));
    await expect(recordInboundMessage(client, message)).resolves.toEqual({ messageId: "m1", isNew: true });
  });

  it("reports a duplicate delivery as is_new=false", async () => {
    const client = fakeClient(new Map([["whatsapp_record_inbound", () => ({ data: [{ message_id: "m1", is_new: false }], error: null })]]));
    await expect(recordInboundMessage(client, message)).resolves.toEqual({ messageId: "m1", isNew: false });
  });

  it("throws on a database error so the route does not acknowledge", async () => {
    const client = fakeClient(new Map([["whatsapp_record_inbound", () => ({ data: null, error: { message: "boom" } })]]));
    await expect(recordInboundMessage(client, message)).rejects.toThrow("whatsapp_record_inbound failed");
  });
});

describe("claim/complete/fail", () => {
  it("maps claim rows and surfaces errors", async () => {
    const rows = [{ id: "m1", external_id: "wamid.1", phone_number: "57300", raw_payload: {}, attempts: 1 }];
    const client = fakeClient(new Map([["whatsapp_claim_inbound", () => ({ data: rows, error: null })]]));
    await expect(claimInbound(client, "w1", 5, 120)).resolves.toEqual(rows);

    const failing = fakeClient(new Map([["whatsapp_claim_inbound", () => ({ data: null, error: { message: "nope" } })]]));
    await expect(claimInbound(failing, "w1")).rejects.toThrow("whatsapp_claim_inbound failed");
  });

  it("completes and fails a row", async () => {
    const calls: string[] = [];
    const client: InboundRpcClient = {
      rpc: (fn: string) => {
        calls.push(fn);
        return Promise.resolve({ data: null, error: null });
      },
    };
    await completeInbound(client, "m1");
    await failInbound(client, "m1", "timeout");
    expect(calls).toEqual(["whatsapp_complete_inbound", "whatsapp_fail_inbound"]);
  });
});
