/**
 * The fields that decide whether two result rows describe the same apartment.
 *
 * Structural on purpose: `/rentals` passes `Rental` rows from the browse projection, while chat
 * passes the looser rows decoded from a tool envelope. Both must be labelled by the same rule, so
 * neither caller has to import the other's schema.
 */
export type DuplicateListingRow = {
  id: string;
  title: string;
  neighborhood: string;
  bedrooms?: number | null;
  nightly_price?: number | null;
  price_monthly?: number | null;
  currency?: string | null;
};

/**
 * Label listings that look like the same apartment.
 *
 * Production sometimes returns two rows with the same title, area, bedrooms and price but different
 * ids/sources. They may both be real (two feeds for one home), so do not delete them; label the
 * later ones so "the second apartment" is not ambiguous. The first occurrence keeps no label.
 *
 * Every surface that lists rentals calls this. Before SAN-1235 only `/rentals` did, so a chat answer
 * showed two identical "Calle 10 #42-15, Laureles" cards with nothing to tell them apart.
 */
export function duplicateListingNotes(
  results: readonly DuplicateListingRow[],
): Map<string, string> {
  const firstSeen = new Map<string, number>();
  const notes = new Map<string, string>();

  results.forEach((rental, index) => {
    const key = [
      rental.title.trim().toLowerCase(),
      rental.neighborhood.trim().toLowerCase(),
      rental.bedrooms ?? "",
      rental.nightly_price ?? "",
      rental.price_monthly ?? "",
      (rental.currency ?? "").toUpperCase(),
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
