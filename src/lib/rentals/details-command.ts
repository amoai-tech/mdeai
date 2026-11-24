import { clearsFurnishingPreference } from "@/lib/rental-query-parser";

/**
 * The exact "show me the details" commands a renter types.
 *
 * The model is non-deterministic here: production sometimes ran a new rental search instead of
 * opening the panel, which replaced the refined list with over-budget apartments. This parser lets
 * the page perform the same frontend action deterministically for the clear command; anything it
 * cannot resolve (a named apartment, "details about furnished places") still goes to the agent.
 */
export type DetailsCommand = { index: number; comparison?: true };

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

const DETAILS_RE =
  /^(?:please\s+)?(?:show|open|see|view)\s+(?:me\s+)?(?:the\s+)?details?(?:\s+(?:for|of|on)\s+(?:the\s+)?(.+))?$/i;

export function parseDetailsCommand(text: string): DetailsCommand | null {
  const raw = text.trim();
  // When a renter first clears furnishing and then requests real apartment
  // Details in the same turn, preserve the original user text for the chat
  // transcript while parsing only the explicit Details clause.
  const detailsAfterClear = clearsFurnishingPreference(raw)
    ? raw.match(/[.!?]\s+((?:please\s+)?(?:show|open|see|view)\s+(?:me\s+)?(?:the\s+)?details?\b.*)$/i)?.[1]
    : undefined;
  const normalized = (detailsAfterClear ?? raw).replace(/[.!?]+$/, "").trim();
  const match = normalized.match(DETAILS_RE);
  if (!match) return null;

  const tail = (match[1] ?? "").trim();
  if (!tail) return { index: 1 };
  // "this one" / "that apartment" / "the listing" all mean the first/current one.
  if (/^(?:apartments?|listing|one|this|that|it)$/i.test(tail)) return { index: 1 };

  // Only a clear position ("apartment 2", "2", "2nd", "second apartment"). An address like
  // "Calle 10 #42-15" also contains a number and must not be read as position 10.
  const option = tail.match(/^option\s*#?\s*(\d+)$/i);
  if (option) return { index: Number(option[1]), comparison: true };
  const numeric =
    tail.match(/^(?:apartment|listing|number|#)\s*(\d+)$/i) ??
    tail.match(/^(\d+)(?:st|nd|rd|th)?(?:\s+(?:apartment|listing))?$/i);
  if (numeric) {
    const index = Number(numeric[1]);
    return Number.isInteger(index) && index > 0 ? { index } : null;
  }

  const word = tail.toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/);
  if (word) {
    // The full chat also contains restaurants and events. Reuse this parser only
    // when the position names a rental (or gives no category), never another domain.
    const remaining = tail.replace(/\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i, "").trim();
    if (remaining && !/^(?:apartment|apartments|listing|listings|rental|rentals|one)$/i.test(remaining)) {
      return null;
    }
    return { index: ORDINALS[word[1]] };
  }

  // A named apartment ("details for Calle 10") is not resolved blindly here.
  return null;
}

/** Explicit comparison-only UI commands. Do not consume questions, searches,
 * combined requests, or viewing requests with date/time instructions. */
export type ComparisonActionCommand = { action: "map" | "viewing"; index: number };
export function parseComparisonActionCommand(text: string): ComparisonActionCommand | null {
  const raw = text.trim().replace(/[.!]+$/, "").trim();
  const map = raw.match(/^(?:please\s+)?(?:show|focus|locate)\s+option\s*#?\s*(\d+)\s+on\s+(?:the\s+)?map$/i);
  const viewing = raw.match(/^(?:please\s+)?(?:schedule|request)\s+(?:a\s+)?viewing\s+(?:for|of)\s+option\s*#?\s*(\d+)$/i);
  if (map) return { action: "map", index: Number(map[1]) };
  if (viewing) return { action: "viewing", index: Number(viewing[1]) };
  return null;
}
