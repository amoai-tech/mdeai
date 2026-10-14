/**
 * SAN-1444 — attach the WhatsApp channel to the SHARED concierge only when the complete
 * Meta credential set is present. The adapter throws eagerly on missing credentials, so an
 * unconditional attach would break web chat in every environment without WhatsApp configured.
 *
 * A configuration error disables the channel; an UNEXPECTED error is re-thrown so a real
 * fault surfaces at startup instead of silently dropping customer messages.
 */
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { readWhatsAppChannelEnv } from "@/lib/whatsapp/channel-env";
import { installWhatsAppSendInterceptor } from "@/lib/whatsapp/outbound-tracker";

/**
 * The adapter throws a chat-sdk ValidationError but does not re-export the class from its
 * public entry, so match it by name rather than depending on an internal module path.
 */
function isAdapterConfigError(error: unknown): boolean {
  return error instanceof Error && error.name === "ValidationError";
}

export function buildConciergeChannels() {
  const env = readWhatsAppChannelEnv();
  if (!env) return undefined;
  try {
    // Record every physical Meta send (chunked text and media included) for the worker's scope.
    installWhatsAppSendInterceptor();
    return { adapters: { whatsapp: createWhatsAppAdapter(env) } };
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
