/**
 * SAN-1444 P0 — durable inbound store.
 *
 * Wraps the SECURITY DEFINER RPCs added in
 * supabase/migrations/20261014090000_san1444_whatsapp_inbound_durability.sql.
 * The client is a narrow RPC surface so this module is unit-testable without Supabase types.
 */

export type InboundRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type InboundMessage = {
  providerMessageId: string;
  from: string;
  messageType: string;
  content: string;
  /** Single-message Meta envelope, so replaying one row processes exactly one message. */
  payload: Record<string, unknown>;
};

export type RecordResult = { messageId: string; isNew: boolean };

export type ClaimedRow = {
  id: string;
  external_id: string | null;
  phone_number: string;
  raw_payload: unknown;
  attempts: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Build a one-message envelope from the original payload so a replay is scoped to one row. */
export function buildSingleMessageEnvelope(
  raw: Record<string, unknown>,
  message: Record<string, unknown>,
): Record<string, unknown> {
  const entry = Array.isArray(raw.entry) ? asRecord(raw.entry[0]) : null;
  const change = entry && Array.isArray(entry.changes) ? asRecord(entry.changes[0]) : null;
  const value = change ? asRecord(change.value) : null;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: entry?.id ?? null,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: value?.metadata ?? {},
              contacts: value?.contacts ?? [],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

/** Extract only inbound user messages (status events are out of scope for this PR). */
export function extractInboundMessages(payload: unknown): InboundMessage[] {
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account") return [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const result: InboundMessage[] = [];
  for (const entry of entries) {
    const entryRecord = asRecord(entry);
    const changes = entryRecord && Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
    for (const change of changes) {
      const changeRecord = asRecord(change);
      if (changeRecord?.field !== "messages") continue;
      const value = asRecord(changeRecord.value);
      if (!value || !Array.isArray(value.messages)) continue;
      for (const message of value.messages) {
        const record = asRecord(message);
        if (!record || typeof record.id !== "string" || typeof record.from !== "string") continue;
        const text = asRecord(record.text);
        result.push({
          providerMessageId: record.id,
          from: record.from,
          messageType: typeof record.type === "string" ? record.type : "unknown",
          content: typeof text?.body === "string" ? text.body : "",
          payload: buildSingleMessageEnvelope(root, record),
        });
      }
    }
  }
  return result;
}

export async function recordInboundMessage(
  client: InboundRpcClient,
  message: InboundMessage,
): Promise<RecordResult> {
  const { data, error } = await client.rpc("whatsapp_record_inbound", {
    p_external_id: message.providerMessageId,
    p_from_e164: message.from,
    p_message_type: message.messageType,
    p_content: message.content,
    p_payload: message.payload,
  });
  if (error) throw new Error("whatsapp_record_inbound failed: " + error.message);
  const row = asRecord(Array.isArray(data) ? data[0] : data);
  if (!row || typeof row.message_id !== "string") {
    throw new Error("whatsapp_record_inbound returned no message id");
  }
  return { messageId: row.message_id, isNew: row.is_new === true };
}

export async function claimInbound(
  client: InboundRpcClient,
  workerId: string,
  limit = 5,
  leaseSeconds = 120,
): Promise<ClaimedRow[]> {
  const { data, error } = await client.rpc("whatsapp_claim_inbound", {
    p_worker: workerId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error("whatsapp_claim_inbound failed: " + error.message);
  return Array.isArray(data) ? (data as ClaimedRow[]) : [];
}

export async function completeInbound(client: InboundRpcClient, messageId: string): Promise<void> {
  const { error } = await client.rpc("whatsapp_complete_inbound", { p_message_id: messageId });
  if (error) throw new Error("whatsapp_complete_inbound failed: " + error.message);
}

export async function failInbound(
  client: InboundRpcClient,
  messageId: string,
  message: string,
  maxAttempts = 5,
  baseBackoffSeconds = 30,
): Promise<void> {
  const { error } = await client.rpc("whatsapp_fail_inbound", {
    p_message_id: messageId,
    p_error: message,
    p_max_attempts: maxAttempts,
    p_base_backoff_seconds: baseBackoffSeconds,
  });
  if (error) throw new Error("whatsapp_fail_inbound failed: " + error.message);
}
