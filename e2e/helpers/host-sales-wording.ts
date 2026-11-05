/**
 * Match stated *sales*, not capacity or remaining inventory. A Host can truthfully
 * say "2 tickets sold, 8 tickets remaining" without contradicting the sales count.
 * Literal patterns use bounded *horizontal* spaces, so a revenue number on the
 * previous line cannot be mistaken for the next line's ticket-sales quantity.
 */

// Extract explicit sold labels; generic counts are also compared unless marked as inventory.
const SOLD_PATTERNS = [
  /(?<![\d,.])\b(\d{1,6})[ \t\u00a0\u202f\u2009]{1,16}tickets?[ \t\u00a0\u202f\u2009]{1,16}(?:were[ \t\u00a0\u202f\u2009]{1,16})?sold\b/gi, // "2 tickets sold"
  /\btickets?[ \t\u00a0\u202f\u2009]{1,16}sold[ \t\u00a0\u202f\u2009]{0,16}[:=\-–]?[ \t\u00a0\u202f\u2009]{0,16}(\d{1,6})(?!\d|[.,]\d)\b/gi, // "Tickets sold: 2"
  /\btickets?[ \t\u00a0\u202f\u2009]{1,16}sold[ \t\u00a0\u202f\u2009]{0,16}[:=\-–][ \t\u00a0\u202f\u2009]{0,16}\r?\n[ \t\u00a0\u202f\u2009]{0,16}(\d{1,6})(?!\d|[.,]\d)\b/gi, // "Tickets sold:\n2"
  /\bsold[ \t\u00a0\u202f\u2009]{0,16}[:=\-–]?[ \t\u00a0\u202f\u2009]{0,16}(\d{1,6})[ \t\u00a0\u202f\u2009]{1,16}tickets?\b/gi, // "You sold 2 tickets"
  /(?:^|[.!?;\n])[ \t\u00a0\u202f\u2009]{0,16}sold[ \t\u00a0\u202f\u2009]{0,16}[:=\-–][ \t\u00a0\u202f\u2009]{0,16}(\d{1,6})(?!\d|[.,]\d)\b/gi, // "Sold: 2" as its own statement
  /(?<![\d,.])\b(\d{1,6})[ \t\u00a0\u202f\u2009]{1,16}sold\b/gi, // "2 sold"
];

const COUNT_BEFORE = /(?<![\d,.])\b(\d{1,6})(?!\d|[.,]\d)[ \t\u00a0\u202f\u2009]{1,16}tickets?\b/gi; // "2 tickets"
const COUNT_AFTER = /\btickets?(?:[ \t\u00a0\u202f\u2009]{1,16}(?:count|total))?[ \t\u00a0\u202f\u2009]{0,16}[:=\-–][ \t\u00a0\u202f\u2009]{0,16}(\d{1,6})(?!\d|[.,]\d)\b/gi; // "Tickets: 2"

function values(text: string, patterns: RegExp[]): number[] {
  const counts: number[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isSafeInteger(value)) counts.push(value);
    }
  }
  return counts;
}

/** Ticket counts describing sales (not available/remaining/capacity amounts). */
export function statedTicketCounts(text: string): number[] {
  // Check sold-labeled figures and unambiguous generic ticket counts together.
  // Capacity and remaining inventory are filtered out below.

  // Backward compatibility for answers such as "2 tickets" or "Tickets: 2".
  // An unqualified "Total tickets" is accepted for the sales question only
  // when no explicit sold quantity clarifies that it means capacity.
  const explicitSold = values(text, SOLD_PATTERNS);
  const counts = [...explicitSold];
  for (const match of text.matchAll(COUNT_BEFORE)) {
    const before = text.slice(Math.max(0, match.index - 32), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 32);
    if (/\b(?:capacity|remaining|available|left|inventory|out[ \t\u00a0\u202f\u2009]{1,16}of|total)[ \t\u00a0\u202f\u2009]*[:=\-–]?[ \t\u00a0\u202f\u2009]*$/i.test(before)) continue;
    // In "2 of 10 tickets", 10 is capacity, but "a total of 2 tickets"
    // still expresses a sales count even if another sold label is present.
    if (explicitSold.length > 0 && /\bof[ \t\u00a0\u202f\u2009]*$/i.test(before)
        && !/\b(?:a[ \t\u00a0\u202f\u2009]{1,16})?total[ \t\u00a0\u202f\u2009]{1,16}of[ \t\u00a0\u202f\u2009]*$/i.test(before)) continue;
    if (/^[ \t\u00a0\u202f\u2009]{0,16}(?:(?:still)[ \t\u00a0\u202f\u2009]{1,16})?(?:(?:remaining|left|available|capacity|total|in[ \t\u00a0\u202f\u2009]{1,16}stock)\b|unsold\b|(?:not|un)(?:[ \t\u00a0\u202f\u2009]{1,16}yet)?[ \t\u00a0\u202f\u2009]{1,16}sold\b)/i.test(after)) continue;
    counts.push(Number(match[1]));
  }
  for (const match of text.matchAll(COUNT_AFTER)) {
    const before = text.slice(Math.max(0, match.index - 32), match.index);
    if (/\b(?:capacity|remaining|available|left|inventory|unsold)[ \t\u00a0\u202f\u2009]*[:=\-–]?[ \t\u00a0\u202f\u2009]*$/i.test(before)) continue;
    if (explicitSold.length > 0 && /\btotal[ \t\u00a0\u202f\u2009]*$/i.test(before)) continue;
    counts.push(Number(match[1]));
  }
  return counts;
}

/** Require a real sales quantity, with no contradictory sales numbers. */
export function statesTicketCount(text: string, count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 0) return false;
  const stated = statedTicketCounts(text);
  return stated.length > 0 && stated.every((value) => value === count);
}
