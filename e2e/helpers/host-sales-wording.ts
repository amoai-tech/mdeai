/**
 * Match stated *sales*, not capacity or remaining inventory. A Host can truthfully
 * say "2 tickets sold, 8 tickets remaining" without contradicting the sales count.
 * All patterns are literal and whitespace-bounded: no dynamic regular expressions.
 */

// Explicit sold labels take priority over generic ticket-count wording.
const SOLD_PATTERNS = [
  /\b(\d{1,6})\s{1,16}tickets?\s{1,16}(?:were\s{1,16})?sold\b/gi, // "2 tickets sold"
  /\btickets?\s{1,16}sold\s{0,16}[:=\-–]?\s{0,16}(\d{1,6})\b/gi, // "Tickets sold: 2"
  /\bsold\s{0,16}[:=\-–]?\s{0,16}(\d{1,6})\s{1,16}tickets?\b/gi, // "You sold 2 tickets"
  /(?:^|[.!?;\n])\s{0,16}sold\s{0,16}[:=\-–]\s{0,16}(\d{1,6})\b/gi, // "Sold: 2" as its own statement
  /\b(\d{1,6})\s{1,16}sold\b/gi, // "2 sold"
];

const COUNT_BEFORE = /\b(\d{1,6})\s{1,16}tickets?\b/gi; // "2 tickets"
const COUNT_AFTER = /\btickets?(?:\s{1,16}(?:count|total))?\s{0,16}[:=\-–]\s{0,16}(\d{1,6})\b/gi; // "Tickets: 2"

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
  const explicitSold = values(text, SOLD_PATTERNS);
  if (explicitSold.length > 0) return explicitSold;

  // Backward compatibility for answers such as "2 tickets" or "Tickets: 2".
  // Do not mistake inventory statements for sales when no sold label exists.
  const counts: number[] = [];
  for (const match of text.matchAll(COUNT_BEFORE)) {
    const before = text.slice(Math.max(0, match.index - 32), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 32);
    if (/\b(?:capacity|remaining|available|left|inventory)\s*[:=\-–]?\s*$/i.test(before)) continue;
    if (/^\s{0,16}(?:remaining|left|available|in\s{1,16}stock)\b/i.test(after)) continue;
    counts.push(Number(match[1]));
  }
  counts.push(...values(text, [COUNT_AFTER]));
  return counts;
}

/** Require a real sales quantity, with no contradictory sales numbers. */
export function statesTicketCount(text: string, count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 0) return false;
  const stated = statedTicketCounts(text);
  return stated.length > 0 && stated.every((value) => value === count);
}
