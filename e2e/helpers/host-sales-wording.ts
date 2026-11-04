/**
 * A truthful sales answer can put the number before or after the word "tickets":
 *
 *   "You sold 2 tickets"   → "2 tickets"
 *   "Tickets sold: 2"      → "Tickets sold: 2"
 *   "Tickets: 2"           → "Tickets: 2"
 *
 * Two rules keep this honest and safe:
 *
 * 1. **Literal, bounded patterns.** No `new RegExp` from a value (a ReDoS finding), and
 *    whitespace runs are capped, so a reply padded with thousands of spaces cannot make
 *    the matcher backtrack or stall. `\s{0,16}` covers real formatting (indentation,
 *    markdown spacing) without allowing unbounded scans.
 * 2. **Every stated count must agree.** It is not enough that the expected number appears
 *    somewhere: "20 tickets. 2 tickets." is a contradictory answer, not a pass.
 */

/** "2 tickets" — the count immediately before the word. */
const COUNT_BEFORE = /\b(\d{1,6})\s{1,16}tickets?\b/gi;
/** "Tickets sold: 2" — the count after the word, with an optional label and separator. */
const COUNT_AFTER = /\btickets?\s{0,16}(?:sold|count|total)?\s{0,16}[:=\-–]?\s{0,16}(\d{1,6})\b/gi;

/** Every ticket count the reply states, in either word order. */
export function statedTicketCounts(text: string): number[] {
  const found: number[] = [];
  for (const pattern of [COUNT_BEFORE, COUNT_AFTER]) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isSafeInteger(value)) found.push(value);
    }
  }
  return found;
}

/**
 * True only when the reply states this count and nothing contradicts it.
 *
 * Missing counts, invalid expectations and contradictory counts all fail — a sales
 * answer that says "2" and "20" must not pass because one of them happens to be right.
 */
export function statesTicketCount(text: string, count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 0) return false;
  const stated = statedTicketCounts(text);
  if (stated.length === 0) return false;
  return stated.every((value) => value === count);
}
