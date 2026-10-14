/**
 * SAN-1444 — attach the WhatsApp channel to the SHARED concierge only when the complete
 * Meta credential set is present. The adapter throws eagerly on missing credentials, so an
 * unconditional attach would break web chat in every environment without WhatsApp configured.
 *
 * A configuration error disables the channel; an UNEXPECTED error is re-thrown so a real
 * fault surfaces at startup instead of silently dropping customer messages.
 */
import { createWhatsAppAdapter, type WhatsAppAdapter, type WhatsAppRawMessage } from "@chat-adapter/whatsapp";
import type { AdapterPostableMessage, RawMessage } from "chat";
import { readWhatsAppChannelEnv } from "@/lib/whatsapp/channel-env";
import { isTrackingOutbound, recordOutboundSend } from "@/lib/whatsapp/outbound-tracker";

/**
 * The adapter throws a chat-sdk ValidationError but does not re-export the class from its
 * public entry, so match it by name rather than depending on an internal module path.
 */
function isAdapterConfigError(error: unknown): boolean {
  return error instanceof Error && error.name === "ValidationError";
}

/**
 * SAN-1444 — record whether each reply actually reached Meta.
 *
 * `postMessage` is the single outbound boundary, and its resolved value carries the provider
 * message id. Inside a worker's tracking scope a failure is recorded instead of being swallowed,
 * so completion can require a confirmed send. Outside a scope this is a pass-through.
 */
function attachOutboundTracking(adapter: WhatsAppAdapter): WhatsAppAdapter {
  // Keep channel construction from depending on the send method's shape: this module must never
  // be the reason web chat fails to boot. Tracked sends would be lost, so say so loudly.
  if (typeof adapter.postMessage !== "function") {
    console.error("[whatsapp] adapter exposes no postMessage; outbound send tracking is disabled");
    return adapter;
  }
  const original = adapter.postMessage.bind(adapter);
  adapter.postMessage = async (
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<WhatsAppRawMessage>> => {
    if (!isTrackingOutbound()) return original(threadId, message);
    try {
      const raw = await original(threadId, message);
      recordOutboundSend({
        ok: true,
        providerMessageId: typeof raw?.id === "string" ? raw.id : null,
      });
      return raw;
    } catch (error) {
      recordOutboundSend({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
  return adapter;
}

export function buildConciergeChannels() {
  const env = readWhatsAppChannelEnv();
  if (!env) return undefined;
  try {
    return { adapters: { whatsapp: attachOutboundTracking(createWhatsAppAdapter(env)) } };
  } catch (error) {
    if (isAdapterConfigError(error)) {
      console.error("[whatsapp] channel disabled — adapter rejected its configuration", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
    console.error("[whatsapp] unexpected channel initialization failure", error);
    throw error;
  }
}
