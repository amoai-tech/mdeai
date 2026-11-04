/**
 * A truthful sales answer can put the number before or after the word "tickets":
 *
 *   "You sold 2 tickets"          → "2 tickets"
 *   "Tickets sold: 2"             → "Tickets sold: 2"
 *   "Tickets: 2"                  → "Tickets: 2"
 *
 * The old assertion only accepted the first form, so an equally correct record-style
 * answer failed.
 *
 * Implementation note: the two patterns are **literals**. Building a RegExp from a
 * parameter (the previous version) is flagged as a ReDoS risk, and the count never
 * needs to be part of the pattern — capture any number, then compare it numerically.
 */

/** "2 tickets" — the count immediately before the word. */
const COUNT_BEFORE = /\b(\d{1,6})\s+tickets?\b/gi;
/** "Tickets sold: 2" — the count after the word, with an optional label and separator. */
const COUNT_AFTER = /\btickets?\s*(?:sold|count|total)?\s*[:=\-–]?\s*(\d{1,6})\b/gi;

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

/** True only when the reply states exactly this count, in either word order. */
export function statesTicketCount(text: string, count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 0) return false;
  return statedTicketCounts(text).includes(count);
}
