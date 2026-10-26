/**
 * The exact "show me the details" commands a renter types.
 *
 * The model is non-deterministic here: production sometimes ran a new rental search instead of
 * opening the panel, which replaced the refined list with over-budget apartments. This parser lets
 * the page perform the same frontend action deterministically for the clear command; anything it
 * cannot resolve (a named apartment, "details about furnished places") still goes to the agent.
 */
export type DetailsCommand = { index: number };

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

const DETAILS_RE =
  /^(?:please\s+)?(?:show|open|see|view)\s+(?:me\s+)?(?:the\s+)?details?(?:\s+(?:for|of|on)\s+(?:the\s+)?(.+))?$/i;

export function parseDetailsCommand(text: string): DetailsCommand | null {
  const normalized = text.trim().replace(/[.!?]+$/, "").trim();
  const match = normalized.match(DETAILS_RE);
  if (!match) return null;

  const tail = (match[1] ?? "").trim();
  if (!tail) return { index: 1 };
  // "this one" / "that apartment" / "the listing" all mean the first/current one.
  if (/^(?:apartments?|listing|one|this|that|it)$/i.test(tail)) return { index: 1 };

  // Only a clear position ("apartment 2", "2", "2nd", "second apartment"). An address like
  // "Calle 10 #42-15" also contains a number and must not be read as position 10.
  const numeric =
    tail.match(/^(?:apartment|listing|number|#)\s*(\d+)$/i) ??
    tail.match(/^(\d+)(?:st|nd|rd|th)?(?:\s+(?:apartment|listing))?$/i);
  if (numeric) {
    const index = Number(numeric[1]);
    return Number.isInteger(index) && index > 0 ? { index } : null;
  }

  const word = tail.toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/);
  if (word) return { index: ORDINALS[word[1]] };

  // A named apartment ("details for Calle 10") is not resolved blindly here.
  return null;
}
