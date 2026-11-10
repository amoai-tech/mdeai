import { readRentalResultHints } from "./generative-ui-context";
import { isActiveRentalsDiscoveryPage } from "./discovery-agent-context";

type MessageLike = { role?: string; content?: unknown };

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

/**
 * An explicit "show … as cards" request is a UI command, not a question. Left to
 * the model it answered in text (measured), so the first step is pinned to the
 * one tool that renders cards. It fires only when the Rentals page has published
 * real IDs; an explicit details request is never redirected here.
 */
const SHOW_AS_CARDS = /\b(show|display|render|see)\b[\s\S]*\bcards?\b/i;
/** "Show three apartments here" is the same command without the word "card". */
const SHOW_PAGE_RESULTS =
  /\b(show|display|render|see)\b[\s\S]*\b(first|these|those|two|three|four|five|\d+)\b[\s\S]*\b(apartments?|listings?|results?|ones?)\b/i;
const ASKS_FOR_DETAILS = /\b(details?|open|book|schedule)\b/i;

/** Only explicit references to listings already on the page may skip search. */
const CURRENT_RESULTS_REFERENCE =
  /\b(these|those|them|here|first|second|third|fourth|fifth|last|current|existing|already|shown|visible)\b|\bon (?:this|the) page\b/i;
/** New filters must go through rental search, even when a card is requested. */
const NEW_SEARCH_CRITERIA =
  /\b(bedrooms?|beds?|studio|furnished|unfurnished|balcony|parking|budget|under|below|above|over|between|less|more|price|cost|monthly|nightly|cop|usd|in|near|around|with|without|before|after|from|until|for)\b|\b\d+\s*(?:br|bed)\b/i;

/**
 * Bedroom-control requests: a page control, not a new search.
 *
 * Requires an explicit control noun ("bedroom control") or an adjust verb
 * ("change the bedrooms"), and refuses results/questions phrasings such as
 * "show me 2 bedroom apartments here" or "how many bedrooms does it have?".
 */
const BEDROOM_WORD = /\b(bedrooms?|beds?|habitaci[oó]n(?:es)?|dormitorios?|rec[áa]maras?)\b/i;
const CONTROL_NOUN = /\b(control|selector|picker|slider|controlador)\b/i;
const ADJUST_VERB = /\b(adjust|change|set|update|choose|pick|edit|cambiar|ajustar|elegir|seleccionar|poner)\b/i;
/** A bedroom count always means a filter or search request, in either language. */
const BEDROOM_COUNT =
  /\b\d+\s*(?:br|bed|bedrooms?|habitaci[oó]n(?:es)?|dormitorios?|rec[áa]maras?)\b/i;
/** Results phrasing, only when the request has neither a control noun nor an adjust verb. */
const RESULTS_PHRASING =
  /\b(show|display|list|see|how many|search|find|new search|details?|open|book|schedule|price|budget|under|over|mu[eé]strame|mostrar|buscar|encontrar)\b/i;

export function shouldRenderRentalFilterControl({
  stepNumber,
  messages,
  requestContext,
}: {
  stepNumber: number;
  messages: readonly MessageLike[];
  requestContext?: { get?: (key: string) => unknown };
}): boolean {
  if (stepNumber !== 0) return false;
  if (!isActiveRentalsDiscoveryPage(requestContext?.get?.("ag-ui"))) return false;
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  if (!text) return false;
  if (!BEDROOM_WORD.test(text)) return false;
  const hasControlNoun = CONTROL_NOUN.test(text);
  const hasAdjustVerb = ADJUST_VERB.test(text);
  if (!hasControlNoun && !hasAdjustVerb) return false;
  // A count means "search/filter for N bedrooms", never "show me a picker".
  if (BEDROOM_COUNT.test(text)) return false;
  // An explicit ask wins over a results verb or a question mark:
  // "show me the bedroom control" and "can you change the bedrooms?" both work.
  if (!hasControlNoun && !hasAdjustVerb && RESULTS_PHRASING.test(text)) return false;
  if (!hasControlNoun && !hasAdjustVerb && /\?\s*$/.test(text)) return false;
  return true;
}

export function shouldRequestRecommendations({
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
  if (!isActiveRentalsDiscoveryPage(agUiContext)) return false;
  if (!readRentalResultHints(agUiContext)) return false;
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const text = messageText(lastUser).trim();
  if (!text) return false;
  if (!SHOW_AS_CARDS.test(text) && !SHOW_PAGE_RESULTS.test(text)) return false;
  if (!CURRENT_RESULTS_REFERENCE.test(text) || NEW_SEARCH_CRITERIA.test(text)) return false;
  return !ASKS_FOR_DETAILS.test(text);
}
