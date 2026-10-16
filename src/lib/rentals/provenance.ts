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
