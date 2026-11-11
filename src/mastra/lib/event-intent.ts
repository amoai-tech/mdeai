import { isActiveEventsDiscoveryPage } from "./discovery-agent-context";

type MessageLike = { role?: string; content?: unknown };

/** Read the latest message text from either plain content or CopilotKit text parts. */
function messageText(message: MessageLike | undefined): string {
  const content = message?.content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as { parts?: Array<{ type?: string; text?: string }>; content?: string };
      return parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content ?? "";
    } catch {
      return content;
    }
  }
  if (content && typeof content === "object") {
    const parsed = content as { parts?: Array<{ type?: string; text?: string }>; content?: string };
    return parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content ?? "";
  }
  return "";
}

const SHOW_AS_CARDS = /\b(show|display|render|see)\b[\s\S]*\bcards?\b/i;

/**
 * SAN-1653 — "show events as cards" is a UI command, not a question. Left to the
 * model it answered in prose on some turns and only rendered on a retry, so the
 * first step is pinned to the event search tool. The bridge then emits the
 * synthetic render_ui deterministically from that tool result.
 *
 * Fires only on the Events page, only on the first step, and never for a request
 * that already asks for details (that is not a card command).
 */
export function shouldSearchEventsForCards({
  stepNumber,
  messages,
  requestContext,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
}): boolean {
  if (stepNumber !== 0) return false;
  if (!isActiveEventsDiscoveryPage(requestContext?.get?.("ag-ui"))) return false;
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  if (!text) return false;
  return SHOW_AS_CARDS.test(text);
}
