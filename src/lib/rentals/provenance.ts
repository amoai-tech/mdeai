/**
 * SAN-1449 — the single source of truth for the self-attested provenance label.
 *
 * Derived only from the row's own metadata, never from a client flag. Both the
 * structured search path and the detail mapper must use this, so the
 * "Not independently verified" disclosure cannot drift between surfaces.
 */
export function isSelfAttested(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const meta = metadata as Record<string, unknown>;
  return meta.inventory_kind === "self_attested" || meta.provenance === "self_attested";
}


/** A disclosed third-party ad is not independent verification of a listing. */
export function isUnverifiedExternalSource(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const meta = metadata as Record<string, unknown>;
  return meta.source_record_type === "third_party_advertisement";
}

/**
 * SAN-1503 — `available_from` is a placeholder, not a promise, when the import recorded that the
 * source never stated a future date ("for rent, dates unconfirmed", "available now", or a "rented
 * until" date that is already past). Cards, the Details panel, chat and the listing calendar must
 * then say "Availability unconfirmed" instead of presenting the stored date as a move-in date.
 * A date the source did state (`source_explicit_date`, `source_rented_until`) is still shown.
 * Rows without these metadata keys (every ordinary listing) are unaffected.
 */
const UNCONFIRMED_DATE_BASES = new Set([
  "source_for_rent_dates_unconfirmed",
  "source_rented_until_past_recheck",
  "source_available_now",
]);

export function isAvailabilityUnconfirmed(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const meta = metadata as Record<string, unknown>;
  return (
    meta.available_from_independently_confirmed === false &&
    typeof meta.available_from_basis === "string" &&
    UNCONFIRMED_DATE_BASES.has(meta.available_from_basis)
  );
}
