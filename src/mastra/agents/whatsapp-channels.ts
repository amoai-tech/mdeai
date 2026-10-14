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
import {
  bufferOutboundText,
  installWhatsAppSendInterceptor,
  isTrackingOutbound,
} from "@/lib/whatsapp/outbound-tracker";

/**
 * The adapter throws a chat-sdk ValidationError but does not re-export the class from its
 * public entry, so match it by name rather than depending on an internal module path.
 */
function isAdapterConfigError(error: unknown): boolean {
  return error instanceof Error && error.name === "ValidationError";
}

function postableText(message: AdapterPostableMessage): string {
  if (typeof message === "string") return message;
  const candidate = message as { markdown?: unknown; text?: unknown };
  if (typeof candidate.markdown === "string") return candidate.markdown;
  if (typeof candidate.text === "string") return candidate.text;
  return "";
}

/** Approval prompts and media must post immediately; only plain reply text is buffered. */
function isPlainText(message: AdapterPostableMessage): boolean {
  if (typeof message === "string") return true;
  const candidate = message as unknown as Record<string, unknown>;
  return (
    candidate.interactive === undefined &&
    candidate.buttons === undefined &&
    candidate.card === undefined &&
    candidate.attachments === undefined &&
    candidate.files === undefined &&
    candidate.media === undefined
  );
}

let sendDirect:
  | ((threadId: string, message: AdapterPostableMessage) => Promise<RawMessage<WhatsAppRawMessage>>)
  | null = null;

/**
 * Buffer the WHOLE agent run and post one reply.
 *
 * Mastra's static channel driver flushes buffered text on every step boundary (text-end,
 * step-finish AND tool-call), so a model that narrates ("I'll check those apartments") before a
 * tool call would produce several WhatsApp notifications. Inside a worker scope we hold plain
 * reply text and send only the final answer once; approval/media messages still post immediately.
 */
function attachWholeRunBuffer(adapter: WhatsAppAdapter): WhatsAppAdapter {
  if (typeof adapter.postMessage !== "function") {
    console.error("[whatsapp] adapter exposes no postMessage; single-reply buffering is disabled");
    return adapter;
  }
  sendDirect = adapter.postMessage.bind(adapter);
  adapter.postMessage = async (
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<WhatsAppRawMessage>> => {
    if (isTrackingOutbound() && isPlainText(message)) {
      const text = postableText(message);
      if (text.trim() !== "") {
        bufferOutboundText(text);
        return { id: "buffered", raw: {} as WhatsAppRawMessage, threadId };
      }
    }
    return sendDirect!(threadId, message);
  };
  return adapter;
}

/**
 * Send the run's final reply exactly once. Returns the provider id, or null when the run
 * buffered nothing (e.g. an approval-only or media-only response).
 */
export async function flushBufferedReply(threadId: string, texts: string[]): Promise<string | null> {
  const answer = texts.filter((text) => text.trim() !== "").at(-1);
  if (!sendDirect || !answer) return null;
  const raw = await sendDirect(threadId, answer);
  return typeof raw?.id === "string" ? raw.id : null;
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
          adapter: attachWholeRunBuffer(createWhatsAppAdapter(env)),
          // No streamed session and no tool cards: the adapter shows a typing indicator while the
          // agent works, and attachWholeRunBuffer posts the single consolidated final reply.
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
