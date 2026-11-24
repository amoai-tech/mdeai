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

/** Exact recorded listing facts: never treat a shared building or title as a unit ID. */
export const APARTMENT_DUPLICATE_FIELDS = [
  "title",
  "neighborhood",
  "address",
  "city",
  "description",
  "landlord_id",
  "host_id",
  "host_name",
  "bedrooms",
  "bathrooms",
  "size_sqm",
  "floor_number",
  "total_floors",
  "furnished",
  "price_daily",
  "price_weekly",
  "price_monthly",
  "currency",
  "deposit_amount",
  "utilities_included",
  "wifi_speed",
  "amenities",
  "building_amenities",
  "images",
  "video_url",
  "virtual_tour_url",
  "source",
  "source_listing_id",
  "source_url",
  "slug",
  "latitude",
  "longitude",
  "available_from",
  "available_to",
  "minimum_stay_days",
  "maximum_stay_days",
  "pet_friendly",
  "smoking_allowed",
  "parking_included",
  "status",
  "moderation_status",
  "listing_workflow_status",
  "rental_can_request_viewing",
  "metadata",
] as const;

/** Preserve the first ranked record and its original ID. Only collapse records with
 * a known matching owner/address and an identical, complete projection of listing facts.
 * Does not modify stored listings, leads, photos or ownership. */
export function deduplicateApartmentRows<T extends { id: string }>(rows: readonly T[]): T[] {
  const ids = new Set<string>();
  const facts = new Set<string>();
  return rows.filter((row) => {
    if (ids.has(row.id)) return false;
    ids.add(row.id);
    const record = row as unknown as Record<string, unknown>;
    if (typeof record.address !== "string" || !record.address.trim() ||
        typeof record.landlord_id !== "string" || !record.landlord_id.trim() ||
        !APARTMENT_DUPLICATE_FIELDS.every((field) =>
          Object.prototype.hasOwnProperty.call(record, field) && record[field] !== undefined)) return true;
    const key = JSON.stringify(APARTMENT_DUPLICATE_FIELDS.map((field) => record[field]));
    if (facts.has(key)) return false;
    facts.add(key);
    return true;
  });
}
