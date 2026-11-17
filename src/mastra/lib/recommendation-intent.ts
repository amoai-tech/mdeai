import { readRentalResultHints, readRentalResultIds, readRentalRenderedCount } from "./generative-ui-context";
import { isActiveRentalsDiscoveryPage, selectedDiscoveryEntityId } from "./discovery-agent-context";

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
  /\b(bedrooms?|beds?|studio|furnished|unfurnished|balcony|parking|budget|under|below|above|over|between|less|more|price|cost|monthly|nightly|cop|usd|in|near|around|with|without|before|after|from|until|for|max(?:imum)?|min(?:imum)?|up\s+to|at\s+most)\b|\b\d+\s*(?:br|bed)\b/i;

/**
 * "From/in the current results" identifies existing cards, not a new search filter.
 * Remove only that exact pointer before detecting new criteria ("with balcony",
 * "under COP 3M", "in Laureles" etc.). Never strip actual filter words.
 */
const CURRENT_RESULTS_POINTER =
  /\b(?:from|in)\s+(?:(?:the\s+)?(?:current|existing|shown|visible)|these|those)\s+(?:results?|listings?|apartments?|ones?)\b/gi;

/** Exclusion wording near a result pointer must not force cards the user rejected. */
const NEGATED_CURRENT_RESULTS_POINTER =
  /\b(?:not|never|aren['’]t|isn['’]t|don['’]t|doesn['’]t|excluding|except|none|nothing|instead\s+of|other\s+than|besides)\b[^\n.!?]{0,55}\b(?:from|in)\s+(?:(?:the\s+)?(?:current|existing|shown|visible)|these|those)\s+(?:results?|listings?|apartments?|ones?)\b/i;

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

/** Route a bedroom-picker request only when the Rentals page owns the control. */
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

/** Force the existing card tool only for positive, filter-free current-result requests. */
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
  if (NEGATED_CURRENT_RESULTS_POINTER.test(text)) return false;
  const requestWithoutCurrentPointer = text.replace(CURRENT_RESULTS_POINTER, " ");
  if (!CURRENT_RESULTS_REFERENCE.test(text) || NEW_SEARCH_CRITERIA.test(requestWithoutCurrentPointer)) return false;
  return !ASKS_FOR_DETAILS.test(text);
}

/**
 * SAN-1658 — an explicit "request/schedule a viewing of <a listed apartment>" is a
 * UI command. Left to the model it sometimes answered "a request is ready" in
 * text without rendering anything (measured at 390px), so the first step is pinned
 * to the one tool that renders the proposal. A timing question ("when can I view")
 * and a request with no reference to a current result are left to the model.
 */
const SCHEDULE_VERB = /\b(schedule|request|book|arrange|set\s*up|pedir|agendar|programar)\b/i;
const VIEWING_NOUN = /\b(viewing|viewings|visit|tour|showing|visita)\b/i;
/**
 * The message must name WHICH apartment: an ordinal ("the second one", "apartment 3",
 * "el primero"), a published ID, or, for "this/that/it", a listing the renter selected.
 * Bare "here", "them" or "this" never force the tool, because the model would then have
 * to guess an ID, which is the silent substitution this change exists to prevent.
 */
const ORDINAL_EN = "(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\\d+(?:st|nd|rd|th))";
const APARTMENT_WORD_EN = "(?:apartments?|listings?|ones?|places?|units?|options?|results?|homes?|flats?|rentals?)";
const ORDINAL_ES = "(?:primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]|d[eé]cim[oa]|[uú]ltim[oa])";
/**
 * An ordinal counts only next to an apartment word ("the second apartment", "the first
 * one", "el primero"), or as "apartment 3" / "#3". A bare "on the 15th" or "the last
 * week of November" is a calendar phrase, not a listing.
 */
const VIEWING_ORDINAL = new RegExp(
  `\\b${ORDINAL_EN}\\s+${APARTMENT_WORD_EN}\\b|\\b(?:el|la)\\s+${ORDINAL_ES}(?!\\s+(?:semana|d[ií]a|mes|a[nñ]o)\\b)\\b|\\b${ORDINAL_ES}\\s+(?:apartamento|anuncio|opci[oó]n|resultado|lugar)\\b|\\b(?:apartments?|listings?|number|no\\.?|apartamento|#)\\s*#?\\d+\\b`,
  "gi",
);
/** Resolve only a published list position; never force the agent to substitute a different rental. */
function publishedViewingPosition(matchedReference: string, publishedCount: number, fullResultCount: number | null): boolean {
  const reference = matchedReference.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const numeric = reference.match(/\d+/);
  let position: number;
  if (numeric) {
    position = Number(numeric[0]);
  } else if (/\b(last|ultim[oa]?)\b/.test(reference)) {
    // The Rentals page can contain far more rows than the published first-ten hints.
    // Never silently substitute hint ten for the actual last apartment.
    if (fullResultCount !== publishedCount) return false;
    position = publishedCount;
  } else {
    const english = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
    const spanish = ["primer", "segund", "tercer", "cuart", "quint", "sext", "septim", "octav", "noven", "decim"];
    // Literal token splitting is sufficient; avoid constructing regexes even from fixed words.
    const tokens: string[] = reference.match(/[a-z]+/g) ?? [];
    const index = english.findIndex((word) => tokens.includes(word));
    position = index >= 0 ? index + 1 : spanish.findIndex((stem) => tokens.some((word) => word.startsWith(stem))) + 1;
  }
  return Number.isSafeInteger(position) && position > 0 && position <= publishedCount;
}

/** Also reject abbreviated choices such as "first or second apartment" and
 * "apartment 1 or 2"; only the second choice may be next to a listing noun. */
// A bare number after "and/or" often means time or people, not a second rental.
// Match numeric alternatives only when immediately tied to a numbered listing.
const VIEWING_ALTERNATIVE_WORD = /\b(?:or|and|o|u|y)\s+(?:(?:the|el|la|del|de)\s+)?(?:(?:apartments?|listings?|ones?)\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]|d[eé]cim[oa]|[uú]ltim[oa])\b/i;
const VIEWING_ALTERNATIVE_NUMBER = /\b(?:apartments?|listings?|places?|units?|options?|results?|homes?|rentals?|apartamentos?|anuncios?|opciones?|resultados?)\s*#?\d+\s+(?:or|and|o|u|y)\s+#?\d+\b(?!\s+(?:friends?|people|guests?|personas?|amigos?|roommates?|pm|am|h)\b)/i;
const VIEWING_DEICTIC = /\b(this|that|it|esta?|ese|esa)\b/i;
const TIMING_QUESTION = /\b(when|what\s+time|cu[aá]ndo)\b/i;
/** A refusal to schedule is not a command, even when the renter names a listing. */
const NEGATED_VIEWING_REQUEST = /\b(?:do\s+not|don[\u2019\u0027]?t|never|please\s+don[\u2019\u0027]?t|no\s+quiero)\s+(?:(?:want\s+to|try\s+to|please)\s+)?(?:schedule|request|book|arrange|set\s+up|pedir|agendar|programar)\b/i;

export function shouldRenderViewingProposal({
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
  if (!SCHEDULE_VERB.test(text) || !VIEWING_NOUN.test(text)) return false;
  if (NEGATED_VIEWING_REQUEST.test(text)) return false;
  if (TIMING_QUESTION.test(text)) return false;
  const publishedIds = readRentalResultIds(agUiContext);
  // Multiple apartment references are ambiguous: never force the model to pick one.
  const ordinalReferences = [...text.matchAll(VIEWING_ORDINAL)];
  if (ordinalReferences.length > 1 || (ordinalReferences.length === 1 && (VIEWING_ALTERNATIVE_WORD.test(text) || VIEWING_ALTERNATIVE_NUMBER.test(text)))) return false;
  if (ordinalReferences.length === 1) {
    return publishedViewingPosition(ordinalReferences[0][0], publishedIds.length, readRentalRenderedCount(agUiContext));
  }
  if (publishedIds.some((id) => text.includes(id))) return true;
  return VIEWING_DEICTIC.test(text) && Boolean(selectedDiscoveryEntityId(agUiContext));
}
