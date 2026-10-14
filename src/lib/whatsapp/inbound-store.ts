/**
 * SAN-1444 P0 — durable inbound store.
 *
 * Wraps the SECURITY DEFINER RPCs in supabase/migrations. Every completion/failure carries the
 * claim token (fencing), so a worker whose lease expired cannot overwrite a newer worker's claim.
 * Confirmed outbound sends are recorded in the SAME transaction as the completion, so "answered"
 * and "provider accepted it" can never disagree.
 */
import type { ConfirmedSend } from "./outbound-tracker";

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
  /** Single-message Meta envelope scoped to the ORIGINAL entry/change, for exact replay. */
  payload: Record<string, unknown>;
};

export type RecordResult = { messageId: string; isNew: boolean };

export type ClaimedRow = {
  id: string;
  external_id: string | null;
  phone_number: string;
  raw_payload: unknown;
  attempts: number;
  claim_token: string | null;
};

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type DeliveryStatusEvent = {
  providerMessageId: string;
  status: WhatsAppDeliveryStatus;
  /** ISO timestamp derived from Meta's unix-seconds field, when present. */
  statusAt: string | null;
  error: string | null;
};

const DELIVERY_STATUSES = new Set<string>(["sent", "delivered", "read", "failed"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Build a one-message envelope from the message's OWN entry and change. */
export function buildSingleMessageEnvelope(
  entry: Record<string, unknown> | null,
  value: Record<string, unknown> | null,
  message: Record<string, unknown>,
): Record<string, unknown> {
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

/** Extract only inbound user messages (status events are handled separately). */
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
          payload: buildSingleMessageEnvelope(entryRecord, value, record),
        });
      }
    }
  }
  return result;
}

/**
 * Extract every delivery status event (sent/delivered/read/failed) from ALL entries and changes,
 * never just the first. A failing status carries Meta's error detail for diagnostics.
 */
export function extractWhatsAppStatuses(payload: unknown): DeliveryStatusEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account") return [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const result: DeliveryStatusEvent[] = [];
  for (const entry of entries) {
    const entryRecord = asRecord(entry);
    const changes = entryRecord && Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
    for (const change of changes) {
      const changeRecord = asRecord(change);
      if (changeRecord?.field !== "messages") continue;
      const value = asRecord(changeRecord.value);
      if (!value || !Array.isArray(value.statuses)) continue;
      for (const status of value.statuses) {
        const record = asRecord(status);
        if (!record || typeof record.id !== "string" || typeof record.status !== "string") continue;
        if (!DELIVERY_STATUSES.has(record.status)) continue;
        const errors = Array.isArray(record.errors) ? record.errors : [];
        const firstError = asRecord(errors[0]);
        const errorTitle = firstError && typeof firstError.title === "string" ? firstError.title : null;
        const errorMessage =
          firstError && typeof firstError.message === "string" ? firstError.message : null;
        const seconds = typeof record.timestamp === "string" ? Number(record.timestamp) : NaN;
        result.push({
          providerMessageId: record.id,
          status: record.status as WhatsAppDeliveryStatus,
          statusAt: Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null,
          error: errorMessage ?? errorTitle,
        });
      }
    }
  }
  return result;
}

/**
 * The count-returning RPCs are declared `returns integer`. Anything else means the RPC contract
 * drifted (bad migration, wrong function overload). Returning 0 would be mistaken for a fenced
 * claim and silently drop the error, so refuse it instead.
 */
function readCount(data: unknown, operation: string): number {
  if (typeof data === "number" && Number.isInteger(data)) return data;
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "number") return data[0];
  throw new Error(operation + " returned an unexpected value: " + JSON.stringify(data));
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
  return { messageId: row.message_id, isNew: Boolean(row.is_new) };
}

export async function claimInbound(
  client: InboundRpcClient,
  workerId: string,
  limit = 5,
  leaseSeconds = 180,
  maxAttempts = 5,
): Promise<ClaimedRow[]> {
  const { data, error } = await client.rpc("whatsapp_claim_inbound", {
    p_worker: workerId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error("whatsapp_claim_inbound failed: " + error.message);
  return Array.isArray(data) ? (data as ClaimedRow[]) : [];
}

export async function deadLetterInbound(
  client: InboundRpcClient,
  maxAttempts = 5,
  leaseSeconds = 180,
): Promise<number> {
  const { data, error } = await client.rpc("whatsapp_dead_letter_inbound", {
    p_max_attempts: maxAttempts,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error("whatsapp_dead_letter_inbound failed: " + error.message);
  return readCount(data, "whatsapp_dead_letter_inbound");
}

/** Returns false when the claim was fenced out (a newer worker owns the row). */
export async function completeInbound(
  client: InboundRpcClient,
  messageId: string,
  claimToken: string | null,
): Promise<boolean> {
  if (!claimToken) return false;
  const { data, error } = await client.rpc("whatsapp_complete_inbound", {
    p_message_id: messageId,
    p_claim_token: claimToken,
  });
  if (error) throw new Error("whatsapp_complete_inbound failed: " + error.message);
  return readCount(data, "whatsapp_complete_inbound") === 1;
}

/**
 * Record the confirmed outbound sends and complete the inbound claim in ONE transaction.
 * Returns the number of sends recorded; 0 means the claim was fenced out or no send was given.
 */
export async function completeInboundWithSends(
  client: InboundRpcClient,
  messageId: string,
  claimToken: string | null,
  sends: ConfirmedSend[],
): Promise<number> {
  if (!claimToken || sends.length === 0) return 0;
  const { data, error } = await client.rpc("whatsapp_complete_inbound_with_sends", {
    p_message_id: messageId,
    p_claim_token: claimToken,
    p_sends: sends,
  });
  if (error) throw new Error("whatsapp_complete_inbound_with_sends failed: " + error.message);
  return readCount(data, "whatsapp_complete_inbound_with_sends");
}

/** Returns false when the claim was fenced out (a newer worker owns the row). */
export async function failInbound(
  client: InboundRpcClient,
  messageId: string,
  claimToken: string | null,
  message: string,
  maxAttempts = 5,
  baseBackoffSeconds = 30,
): Promise<boolean> {
  if (!claimToken) return false;
  const { data, error } = await client.rpc("whatsapp_fail_inbound", {
    p_message_id: messageId,
    p_claim_token: claimToken,
    p_error: message,
    p_max_attempts: maxAttempts,
    p_base_backoff_seconds: baseBackoffSeconds,
  });
  if (error) throw new Error("whatsapp_fail_inbound failed: " + error.message);
  return readCount(data, "whatsapp_fail_inbound") === 1;
}

/**
 * Persist one Meta delivery callback. Safe for duplicates and out-of-order events (the RPC never
 * regresses a status) and for an early callback that arrives before the outbound row exists.
 */
export async function recordDeliveryStatus(
  client: InboundRpcClient,
  event: DeliveryStatusEvent,
): Promise<number> {
  const { data, error } = await client.rpc("whatsapp_record_delivery_status", {
    p_external_id: event.providerMessageId,
    p_status: event.status,
    p_status_at: event.statusAt,
    p_error: event.error,
  });
  if (error) throw new Error("whatsapp_record_delivery_status failed: " + error.message);
  return readCount(data, "whatsapp_record_delivery_status");
}
