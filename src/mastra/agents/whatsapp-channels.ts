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
    return {
      adapters: {
        whatsapp: {
          adapter: createWhatsAppAdapter(env),
          // WhatsApp has no message editing: streamed progress arrives as many separate
          // notifications (one question produced 7 messages). Post consolidated replies and hide
          // tool/progress output instead.
          //
          // ponytail: this REDUCES the message count, it does not guarantee exactly one. Mastra's
          // static driver flushes buffered text on `text-end`, `step-finish` AND `tool-call`
          // (@mastra/core dist, the static driver's flush triggers), so a model that narrates
          // ("I'll check those apartments") before searching can still emit a second message.
          // Guaranteeing one message needs whole-run output buffering plus a deterministic
          // multi-step channel test — a separate change, not this one.
          streaming: false,
          toolDisplay: "hidden" as const,
        },
      },
    };
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
