import type { EventCard } from "@/mastra/tools/search-events";

/**
 * SAN-611: check structured event facts against the SAME returned event row.
 * The generic faithfulness scorer flattens all tool rows and cannot catch
 * swapped dates/prices between two genuine events.
 *
 * Used by CI fixtures only. No live response adapter extracts source-bound
 * claims from Concierge prose yet, so this is NOT production enforcement.
 * TODO(SAN-611): Use captured real model replies + their exact tool rows
 * before integrating source-bound checks into the existing Mastra scorer.
 */
export type ClaimedEventFacts = Pick<EventCard, "id"> &
  Partial<Pick<EventCard, "title" | "startsAt" | "pricePerTicket" | "currency" | "canBuyTickets">>;

export type EventFactMismatch = {
  eventId: string;
  /** id means the claimed event was not present in the source rows. */
  field: "id" | "title" | "startsAt" | "pricePerTicket" | "currency" | "canBuyTickets";
};

/** Returns missing IDs and fields that contradict their source row. */
export function findEventFactMismatches(
  sourceRows: readonly EventCard[],
  claims: readonly ClaimedEventFacts[],
): EventFactMismatch[] {
  if (claims.length === 0) {
    throw new Error("No structured event claims to verify; an empty answer is not a pass.");
  }
  const source = new Map(sourceRows.map((row) => [row.id, row]));
  const mismatches: EventFactMismatch[] = [];

  for (const claim of claims) {
    const row = source.get(claim.id);
    if (!row) {
      mismatches.push({ eventId: claim.id, field: "id" });
      continue;
    }
    for (const field of ["title", "startsAt", "pricePerTicket", "currency", "canBuyTickets"] as const) {
      // Undefined means the answer made no assertion about this field.
      // Null IS an assertion: an unknown price is not a free (zero) ticket.
      if (claim[field] === undefined) continue;
      if (field === "startsAt") {
        // ISO strings with Z, fractional seconds, or a local UTC offset can
        // represent exactly the same instant. Invalid timestamps are never trusted.
        const claimedAt = Date.parse(claim.startsAt!);
        const sourceAt = Date.parse(row.startsAt);
        if (!Number.isFinite(claimedAt) ||
            !Number.isFinite(sourceAt) ||
            claimedAt !== sourceAt) {
          mismatches.push({ eventId: claim.id, field });
        }
      } else if (claim[field] !== row[field]) {
        mismatches.push({ eventId: claim.id, field });
      }
    }
  }
  return mismatches;
}
