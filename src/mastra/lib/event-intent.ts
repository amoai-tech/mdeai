import { isActiveEventsDiscoveryPage } from "./discovery-agent-context";
import { readEventResultHints } from "./generative-ui-context";

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
// Avoid hijacking generic card-payment questions or native Details requests.
// An explicit event type is necessary before pinning the event search tool.
const EVENT_TOPIC = /\b(?:events?|concerts?|festivals?|gigs?|parties|performances?)\b/i;
const ASKS_FOR_DETAILS = /\b(?:details?|open|book|schedule)\b/i;

// New discovery criteria still require search, but display phrasing such as
// "in the current results" or "in a grid" does not introduce a filter.
const CURRENT_EVENT_REFERENCE =
  /\b(?:first|second|third|fourth|fifth|sixth|last|these|those|current|existing|shown|already|visible)\b/i;
const CURRENT_RESULT_PHRASE =
  /\b(?:from|in)\s+(?:(?:the\s+)?(?:current|existing|shown|visible|these|those)\s+)?(?:results?|events?)\b/gi;
const DISPLAY_LAYOUT_PHRASE = /\bin\s+(?:(?:a|the)\s+)?(?:cards?|grid|list)\b/gi;
const NEW_EVENT_SEARCH_CRITERIA =
  /\b(?:today|tomorrow|tonight|weekend|free|paid|near|around|with|without|before|after|under|over|between|price|tickets?|category|in)\b|\b(?:this|next)\s+(?:week|month|weekend)\b/i;


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
  const agUiContext = requestContext?.get?.("ag-ui");
  if (!isActiveEventsDiscoveryPage(agUiContext)) return false;
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  if (!text) return false;
  if (!SHOW_AS_CARDS.test(text) || !EVENT_TOPIC.test(text) || ASKS_FOR_DETAILS.test(text)) return false;
  // Existing-result ordinal commands must use the published IDs, not force
  // another search that might reorder or exclude the requested event.
  if (CURRENT_EVENT_REFERENCE.test(text) && readEventResultHints(agUiContext)) {
    const withoutDisplayPhrases = text
      .replace(CURRENT_RESULT_PHRASE, " ")
      .replace(DISPLAY_LAYOUT_PHRASE, " ");
    if (!NEW_EVENT_SEARCH_CRITERIA.test(withoutDisplayPhrases)) return false;
  }
  return true;
}
