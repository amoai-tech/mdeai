/**
 * A truthful sales answer can put the number before or after the word "tickets":
 *
 *   "You sold 2 tickets"          ("2 tickets")
 *   "Tickets sold: 2"             ("Tickets sold: 2")
 *   "Tickets: 2"                  ("Tickets: 2")
 *
 * The old assertion only accepted the first form, so an equally correct record-style
 * answer failed. This matches both without loosening the number itself: `\b` keeps
 * "20" and "12" from passing as "2", and the amount is anchored to the word "ticket".
 */
export function ticketCountPattern(count: number): RegExp {
  const n = String(count);
  return new RegExp(
    `\\b${n}\\s+tickets?\\b` + // "2 tickets"
      `|\\btickets?\\s*(?:sold|count|total)?\\s*[:=\\-–]?\\s*${n}\\b`, // "Tickets sold: 2"
    "i",
  );
}

export function statesTicketCount(text: string, count: number): boolean {
  return ticketCountPattern(count).test(text);
}
