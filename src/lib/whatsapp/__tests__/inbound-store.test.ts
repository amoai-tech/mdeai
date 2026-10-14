import { describe, expect, it, vi } from "vitest";
import {
  buildSingleMessageEnvelope,
  claimInbound,
  completeInbound,
  deadLetterInbound,
  extractInboundMessages,
  failInbound,
  recordInboundMessage,
  type InboundRpcClient,
} from "../inbound-store";

const envelope = (changes: unknown[]) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "W", changes }],
});

describe("extractInboundMessages", () => {
  it("extracts a text message with a single-message replay envelope", () => {
    const payload = envelope([{ field: "messages", value: { metadata: { phone_number_id: "123" }, messages: [{ id: "wamid.IN", from: "57300", type: "text", text: { body: "hola" } }] } }]);
    const [message] = extractInboundMessages(payload);
    expect(message.providerMessageId).toBe("wamid.IN");
    expect(message.content).toBe("hola");
    const replayed = message.payload as { entry: Array<{ changes: Array<{ value: { messages: unknown[] } }> }> };
    expect(replayed.entry[0].changes[0].value.messages).toHaveLength(1);
  });

  it("scopes replay to the message's OWN entry and change (multi-entry payload)", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        { id: "E1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, messages: [{ id: "wamid.1", from: "1", type: "text", text: { body: "one" } }] } }] },
        { id: "E2", changes: [{ field: "messages", value: { metadata: { phone_number_id: "222" }, messages: [{ id: "wamid.2", from: "2", type: "text", text: { body: "two" } }] } }] },
      ],
    };
    const messages = extractInboundMessages(payload);
    expect(messages.map((m) => m.content)).toEqual(["one", "two"]);
    const second = messages[1].payload as { entry: Array<{ id: string; changes: Array<{ value: { metadata: { phone_number_id: string }; messages: Array<{ id: string }> } }> }> };
    expect(second.entry[0].id).toBe("E2");
    expect(second.entry[0].changes[0].value.metadata.phone_number_id).toBe("222");
    expect(second.entry[0].changes[0].value.messages).toEqual([{ id: "wamid.2", from: "2", type: "text", text: { body: "two" } }]);
  });

  it("ignores non-message fields, malformed entries and status-only payloads", () => {
    expect(extractInboundMessages(null)).toEqual([]);
    expect(extractInboundMessages({ object: "page" })).toEqual([]);
    expect(extractInboundMessages(envelope([{ field: "messages", value: { metadata: {}, messages: [] } }]))).toEqual([]);
    expect(extractInboundMessages({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "account_update" }] }] })).toEqual([]);
  });
});

describe("buildSingleMessageEnvelope", () => {
  it("uses the supplied entry and value verbatim", () => {
    const built = buildSingleMessageEnvelope({ id: "E9" }, { metadata: { phone_number_id: "9" } }, { id: "a" }) as { entry: Array<{ id: string; changes: Array<{ value: { metadata: unknown; messages: unknown[] } }> }> };
    expect(built.entry[0].id).toBe("E9");
    expect(built.entry[0].changes[0].value.metadata).toEqual({ phone_number_id: "9" });
    expect(built.entry[0].changes[0].value.messages).toEqual([{ id: "a" }]);
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

const message = { providerMessageId: "wamid.1", from: "57300", messageType: "text", content: "hi", payload: {} };

describe("recordInboundMessage", () => {
  it("returns the id and is_new flag", async () => {
    const client = fakeClient(new Map([["whatsapp_record_inbound", () => ({ data: [{ message_id: "m1", is_new: true }], error: null })]]));
    await expect(recordInboundMessage(client, message)).resolves.toEqual({ messageId: "m1", isNew: true });
  });
  it("reports a duplicate as is_new=false", async () => {
    const client = fakeClient(new Map([["whatsapp_record_inbound", () => ({ data: [{ message_id: "m1", is_new: false }], error: null })]]));
    await expect(recordInboundMessage(client, message)).resolves.toEqual({ messageId: "m1", isNew: false });
  });
  it("throws on a database error so the route does not acknowledge", async () => {
    const client = fakeClient(new Map([["whatsapp_record_inbound", () => ({ data: null, error: { message: "boom" } })]]));
    await expect(recordInboundMessage(client, message)).rejects.toThrow("whatsapp_record_inbound failed");
  });
});

describe("claim / complete / fail / dead-letter", () => {
  const rows = [{ id: "m1", external_id: "wamid.1", phone_number: "57300", raw_payload: {}, attempts: 1, claim_token: "tok" }];

  it("passes the attempt ceiling and lease when claiming", async () => {
    let seen: Record<string, unknown> | undefined;
    const client = fakeClient(new Map([["whatsapp_claim_inbound", (args) => { seen = args; return { data: rows, error: null }; }]]));
    await expect(claimInbound(client, "w1", 5, 180, 5)).resolves.toEqual(rows);
    expect(seen?.p_max_attempts).toBe(5);
    expect(seen?.p_lease_seconds).toBe(180);
  });

  it("treats 0 affected rows as a fenced-out (stale) claim", async () => {
    const client = fakeClient(new Map([
      ["whatsapp_complete_inbound", () => ({ data: 0, error: null })],
      ["whatsapp_fail_inbound", () => ({ data: 0, error: null })],
    ]));
    await expect(completeInbound(client, "m1", "tok")).resolves.toBe(false);
    await expect(failInbound(client, "m1", "tok", "late")).resolves.toBe(false);
  });

  it("returns true when exactly one row was owned and updated", async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const client: InboundRpcClient = {
      rpc: (fn, args) => { calls.push({ fn, args }); return Promise.resolve({ data: 1, error: null }); },
    };
    await expect(completeInbound(client, "m1", "tok")).resolves.toBe(true);
    await expect(failInbound(client, "m1", "tok", "timeout")).resolves.toBe(true);
    expect(calls[1].args?.p_claim_token).toBe("tok");
  });

  it("throws when a count RPC returns an unexpected value instead of reporting stale", async () => {
    const client = fakeClient(new Map<string, RpcHandler>([
      ["whatsapp_complete_inbound", () => ({ data: { count: 1 }, error: null })],
      ["whatsapp_fail_inbound", () => ({ data: null, error: null })],
    ]));
    await expect(completeInbound(client, "m1", "tok")).rejects.toThrow("unexpected value");
    await expect(failInbound(client, "m1", "tok", "x")).rejects.toThrow("unexpected value");
  });

  it("refuses to complete or fail without a claim token", async () => {
    const client = fakeClient(new Map());
    await expect(completeInbound(client, "m1", null)).resolves.toBe(false);
    await expect(failInbound(client, "m1", null, "x")).resolves.toBe(false);
  });

  it("dead-letters exhausted work and returns the count", async () => {
    const client = fakeClient(new Map([["whatsapp_dead_letter_inbound", () => ({ data: 3, error: null })]]));
    await expect(deadLetterInbound(client, 5, 180)).resolves.toBe(3);
  });
});
