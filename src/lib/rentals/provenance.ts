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
 * SAN-1502 — is this a third-party-source listing?
 *
 * Source attribution must be independent of booking eligibility. The nine imported
 * Fincaraíz listings lost their legacy `inventory_kind`/`allowed_action` classification
 * markers, but kept the preserved provenance (`source_record_type`,
 * `source_provider`, `source_original_url`). Recognition therefore reads the preserved
 * provenance first and still accepts the legacy markers, so no listing silently
 * becomes an "ordinary MDE listing".
 */
export function isExternalSourceListing(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const meta = metadata as Record<string, unknown>;
  if (meta.source_record_type === "third_party_advertisement") return true;
  return (
    meta.inventory_kind === "external_candidate" ||
    meta.inventory_type === "external" ||
    meta.allowed_action === "view_original_listing"
  );
}

/** The advertiser's display name, when the import preserved one. */
export function externalSourceProvider(metadata: unknown): string | null {
  if (!isExternalSourceListing(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  for (const key of ["source_provider", "source_name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
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
