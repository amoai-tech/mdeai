import type { Rental } from "@/mastra/tools/search-rentals";

/**
 * Label listings that look like the same apartment.
 *
 * Production sometimes returns two rows with the same title, area, bedrooms and price but different
 * ids/sources. They may both be real (two feeds for one home), so do not delete them; label the
 * later ones so "the second apartment" is not ambiguous. The first occurrence keeps no label.
 */
export function duplicateListingNotes(results: readonly Rental[]): Map<string, string> {
  const firstSeen = new Map<string, number>();
  const notes = new Map<string, string>();

  results.forEach((rental, index) => {
    const key = [
      rental.title.trim().toLowerCase(),
      rental.neighborhood.trim().toLowerCase(),
      rental.bedrooms,
      rental.nightly_price,
      rental.price_monthly ?? "",
      rental.currency.toUpperCase(),
    ].join("|");
    const first = firstSeen.get(key);
    if (first === undefined) {
      firstSeen.set(key, index + 1);
      return;
    }
    notes.set(rental.id, `Also listed as #${first}`);
  });

  return notes;
}
