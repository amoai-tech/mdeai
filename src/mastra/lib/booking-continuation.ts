/**
 * SAN-1149: Keep a slot-complete table request moving after restaurant search.
 * An agent can otherwise stop after discovery cards or repeat the same search.
 * This changes tool selection only: requestVenueBooking is a proposal-only tool,
 * and the existing customer-confirmed API remains the sole booking writer.
 */
type Message = { role: string; content: unknown };
type ToolStep = {
  toolCalls?: readonly { toolName?: string }[];
  toolResults?: readonly { toolName?: string; output?: unknown }[];
};

const SEARCH_NAMES = new Set(['searchRestaurantsTool', 'search-restaurants']);
const BOOKING_NAMES = new Set(['requestVenueBooking', 'request-venue-booking']);
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
// The search tool writes only its own verified public result into Mastra's
// per-run RequestContext. A model may receive tool results as JSON, text, or
// summary parts; a saved trusted search receipt avoids that transport drift.
export const RESTAURANT_BOOKING_SEARCH_KEY = 'mdeaiRestaurantBookingSearch';
export type RestaurantBookingSearchContext = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
};

export function rememberGroundedRestaurantSearch(
  ctx: RestaurantBookingSearchContext | undefined,
  result: { source: string; results: readonly { id: string; name: string }[] },
): void {
  if (!ctx) return;
  ctx.set(RESTAURANT_BOOKING_SEARCH_KEY, {
    source: result.source,
    results: result.source === 'supabase'
      ? result.results.filter(row => UUID.test(row.id)).map(({ id, name }) => ({ id, name }))
      : [],
  });
}


function userText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object' || !('parts' in content) || !Array.isArray(content.parts)) return '';
  return content.parts.filter((p): p is { type: 'text'; text: string } =>
    p != null && typeof p === 'object' && p.type === 'text' && typeof p.text === 'string')
    .map(p => p.text).join(' ');
}

/** Deliberately conservative: no automatic proposal for missing customer fields. */
export function hasCompleteRestaurantBookingDetails(text: string): boolean {
  return /\b(book|booking|reserv(?:e|ation)|table request|request (?:a |the )?table|table for)\b/i.test(text)
    && /\b(?:20\d{2}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})?)\b/i.test(text)
    && /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text)
    && /\b(?:for|party(?:\s+size)?(?:\s+of)?|guests?:?)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d?)\b/i.test(text)
    && /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(text)
    // Require a named-contact cue, but accept how people actually type it.
    // Do not infer a name from an unrelated capitalized venue/location word.
    && /\b(?:(?:contact\s+)?name\s*(?:is\s+|[:=-]\s*|\s+)[A-Z][a-z]+|call\s+me\s+[A-Z][a-z]+|i(?:'m|\s+am)\s+[A-Z][a-z]+)/i.test(text);
}

// Static boundary test only: restaurant labels are data, never regex source.
// Limit work for malformed or unexpectedly large provider/user text.
const NAME_WORD_CHAR = /[\p{L}\p{N}]/u;

function containsExactName(text: string, name: string): boolean {
  const literal = name.trim();
  if (literal.length < 2 || literal.length > 160 || text.length > 16_000) return false;

  const haystack = text.toLocaleLowerCase();
  const needle = literal.toLocaleLowerCase();
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    // Two UTF-16 units cover one adjacent Unicode code point (incl. astral characters).
    const previous = at === 0 ? '' : Array.from(haystack.slice(Math.max(0, at - 2), at)).at(-1) ?? '';
    const next = Array.from(haystack.slice(at + needle.length, at + needle.length + 2))[0] ?? '';
    if (!NAME_WORD_CHAR.test(previous) && !NAME_WORD_CHAR.test(next)) return true;
  }
  return false;
}

function hasGroundedNamedRestaurant(text: string, output: unknown): boolean {
  // Mastra StepResult.toolResults[].output follows AI SDK v6 ToolResultOutput:
  // { type: 'json', value: toolExecutionResult }. The browser cards receive
  // the inner result, while processInputStep receives this typed wrapper.
  const candidate = output && typeof output === 'object' && 'type' in output &&
    output.type === 'json' && 'value' in output ? output.value : output;
  if (!candidate || typeof candidate !== 'object') return false;
  const result = candidate as { source?: unknown; results?: unknown };
  if (result.source !== 'supabase' || !Array.isArray(result.results)) return false;
  return result.results.some((row: unknown) => {
    if (!row || typeof row !== 'object') return false;
    const venue = row as { id?: unknown; name?: unknown };
    return typeof venue.id === 'string' && UUID.test(venue.id)
      && typeof venue.name === 'string' && containsExactName(text, venue.name);
  });
}

export function shouldContinueVenueBookingAfterSearch({
  stepNumber, messages, steps, requestContext,
}: {
  stepNumber: number;
  messages: readonly Message[];
  steps: readonly ToolStep[];
  requestContext?: Pick<RestaurantBookingSearchContext, 'get'> & Partial<Pick<RestaurantBookingSearchContext, 'set'>>;
}): boolean {
  // A client can supply unreserved request-context keys. Invalidate any such
  // value before the first model step; only the server-side restaurant tool may
  // populate this key during the current agent run.
  if (stepNumber === 0) {
    requestContext?.set?.(RESTAURANT_BOOKING_SEARCH_KEY, null);
    return false;
  }
  // The trusted per-run receipt is sufficient even if Mastra omits prior steps.
  const lastUser = messages.findLast(m => m.role === 'user');
  const text = lastUser ? userText(lastUser.content) : '';
  if (!hasCompleteRestaurantBookingDetails(text)) return false;
  // Check only tool results from this agent run, not historic search cards.
  if (steps.some(step => step.toolCalls?.some(call => BOOKING_NAMES.has(call.toolName || '')))) return false;
  return steps.some(step => step.toolResults?.some(result =>
    SEARCH_NAMES.has(result.toolName || '') && hasGroundedNamedRestaurant(text, result.output)))
    || hasGroundedNamedRestaurant(text, requestContext?.get(RESTAURANT_BOOKING_SEARCH_KEY));
}
