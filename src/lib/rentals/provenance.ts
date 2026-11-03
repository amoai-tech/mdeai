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
  // SAN-1502 Phase A: an imported record activated as MDE-managed development inventory
  // is presented as an ordinary MDE listing. Its provenance stays in the source_* keys
  // for internal traceability and pre-launch cleanup, but it is not shown as external.
  if (meta.mde_managed_development === true) return false;
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
export const UNCONFIRMED_DATE_BASES: ReadonlySet<string> = new Set([
  "source_for_rent_dates_unconfirmed",
  "source_rented_until_past_recheck",
  "source_available_now",
]);
/**
 * The search filter in availability-filter.ts is BUILT from these two sets (and the rules in
 * `isAvailabilityUnconfirmed` below), so the card label and the search result cannot disagree.
 */
export const UNCONFIRMED_AVAILABILITY_STATUSES: ReadonlySet<string> = new Set(["unconfirmed", "source_claim_unverified"]);

export function isAvailabilityUnconfirmed(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const meta = metadata as Record<string, unknown>;
  // SAN-486/SAN-1235: ONE definition, shared with the search filter. If search treats a stored date
  // as unconfirmed, the card and Details must say so — otherwise a listing could be excluded from
  // confirmed matches while being displayed as if its date were confirmed.
  // An explicitly confirmed date wins: a date an owner later confirmed must show again.
  if (meta.available_from_independently_confirmed === true) return false;
  if (meta.test_available_from_simulated === true || meta.test_available_from_simulated === "true") {
    return true;
  }
  const status = typeof meta.availability_status === "string" ? meta.availability_status : null;
  if (status && UNCONFIRMED_AVAILABILITY_STATUSES.has(status)) return true;
  const basis = typeof meta.available_from_basis === "string" ? meta.available_from_basis : null;
  if (basis && UNCONFIRMED_DATE_BASES.has(basis)) return true;
  // A source that actually stated the date keeps it confirmed; anything else marked "not
  // independently confirmed" is not a confirmed date either.
  if (meta.available_from_independently_confirmed === false && !basis) return true;
  return false;
}
