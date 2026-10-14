/**
 * Meta WhatsApp webhook security and envelope validation (SAN-1444).
 *
 * Pure functions with no I/O so the ingress contract is provable without Meta credentials.
 * The installed adapter also verifies signatures; this module is the pre-acknowledgement
 * gate used before any durable work is recorded.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_WEBHOOK_BYTES = 3 * 1024 * 1024;

/** HMAC-SHA256 over the ORIGINAL raw bytes, compared timing-safe. */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [algorithm, digest] = signatureHeader.split("=");
  if (algorithm !== "sha256" || !digest) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = Buffer.from(digest, "hex");
  const want = Buffer.from(expected, "hex");
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

/**
 * Sign a body with the Meta app secret. Used only to replay an ALREADY-verified stored message
 * back through the adapter; never to accept an untrusted request.
 */
export function signWebhookBody(rawBody: string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

/** Meta's one-time GET handshake. Returns the challenge to echo, or null to refuse. */
export function resolveVerificationChallenge(url: URL, verifyToken: string): string | null {
  if (url.searchParams.get("hub.mode") !== "subscribe") return null;
  if (!verifyToken || url.searchParams.get("hub.verify_token") !== verifyToken) return null;
  return url.searchParams.get("hub.challenge") ?? null;
}

export type LimitedBody =
  | { ok: true; body: string }
  | { ok: false; reason: "too_large" | "unreadable" };

/**
 * Read a request body without buffering more than maxBytes. The declared content-length is a
 * cheap first barrier but can be spoofed/absent, so the stream itself is also capped.
 * Reads a clone, leaving the original request body intact for the adapter.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number = MAX_WEBHOOK_BYTES,
): Promise<LimitedBody> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  const stream = request.body;
  if (!stream) return { ok: true, body: "" };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: new TextDecoder().decode(merged) };
}

export type WhatsAppInboundEvent = {
  kind: "message" | "status";
  providerEventId: string | null;
  phoneNumberId: string | null;
  from: string | null;
  status: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Extract the events MDE will act on. Unknown fields, unknown message types and malformed
 * entries are ignored rather than treated as business actions.
 */
export function extractInboundEvents(payload: unknown): WhatsAppInboundEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account") return [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const events: WhatsAppInboundEvent[] = [];
  for (const entry of entries) {
    const entryRecord = asRecord(entry);
    const changes = Array.isArray(entryRecord?.changes) ? entryRecord!.changes : [];
    for (const change of changes) {
      const changeRecord = asRecord(change);
      if (changeRecord?.field !== "messages") continue;
      const value = asRecord(changeRecord.value);
      if (!value) continue;
      const metadata = asRecord(value.metadata);
      const phoneNumberId =
        typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : null;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const record = asRecord(message);
        if (!record) continue;
        events.push({
          kind: "message",
          providerEventId: typeof record.id === "string" ? record.id : null,
          phoneNumberId,
          from: typeof record.from === "string" ? record.from : null,
          status: null,
        });
      }
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        const record = asRecord(status);
        if (!record) continue;
        events.push({
          kind: "status",
          providerEventId: typeof record.id === "string" ? record.id : null,
          phoneNumberId,
          from: null,
          status: typeof record.status === "string" ? record.status : null,
        });
      }
    }
  }
  return events;
}

const DELIVERY_ORDER = ["pending", "sent", "delivered", "read"] as const;

/**
 * Monotonic delivery status. Late/out-of-order callbacks never regress a newer status;
 * failed is terminal once observed.
 */
export function mergeDeliveryStatus(current: string | null, incoming: string | null): string | null {
  if (!incoming) return current;
  if (current === "failed") return current;
  if (incoming === "failed") return incoming;
  const currentRank = DELIVERY_ORDER.indexOf(current as (typeof DELIVERY_ORDER)[number]);
  const incomingRank = DELIVERY_ORDER.indexOf(incoming as (typeof DELIVERY_ORDER)[number]);
  if (incomingRank === -1) return current;
  if (currentRank === -1) return incoming;
  return incomingRank > currentRank ? incoming : current;
}
