/**
 * Pure decision logic for the SAN-1432 public photo-rights remediation.
 *
 * No I/O and no dependencies, so it is unit-testable with `node --test`.
 * The operator script (scripts/quarantine-unapproved-rental-photos.mjs) supplies
 * the storage listing and listing references; this module only decides.
 */

export const LISTING_PHOTOS_BUCKET = "listing-photos";
export const POLICY_EXCLUDED_PREFIX = "external-discovery/";
export const PUBLIC_URL_MARKER = "/storage/v1/object/public/listing-photos/";
export const PRIVATE_BUCKET_PREFIXES = ["partner-assets/", "contracts/", "identity-docs/"];

/**
 * Reviewed 2026-10-14. Five identical orphaned JPEGs (one etag, 39183 bytes each)
 * and one 4-byte sweep-test artifact in the public listing-photos bucket.
 * Removal is refused unless the object is also unreferenced by listing data.
 */
export const REVIEWED_REMOVAL_ALLOWLIST = Object.freeze([
  "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578474641_rent.jpg",
  "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578486212_rent.jpg",
  "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578493192_rent.jpg",
  "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578496417_rent.jpg",
  "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578502278_rent.jpg",
  "a5f6adc5-5e86-4730-8ade-3617893a4f68/sweep-test/1777588084265_sweep.jpg",
]);

/**
 * Resolve a stored listing reference to a listing-photos object name.
 * Handles full public URLs, a bare `listing-photos/<name>` path, and a bare
 * object path (e.g. `<uuid>/file.jpg`). Returns null for private-bucket paths
 * and for absolute URLs that are not listing-photos objects.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function objectNameFromReference(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const markerIndex = trimmed.indexOf(PUBLIC_URL_MARKER);
  if (markerIndex >= 0) {
    return decodeURIComponent(trimmed.slice(markerIndex + PUBLIC_URL_MARKER.length));
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null; // another absolute URL
  if (trimmed.startsWith(LISTING_PHOTOS_BUCKET + "/")) {
    return trimmed.slice(LISTING_PHOTOS_BUCKET.length + 1);
  }
  if (PRIVATE_BUCKET_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return null;
  return trimmed.includes("/") ? trimmed : null;
}

/**
 * Extract the set of listing-photos object names referenced by listing rows.
 *
 * @param {Array<{images?: unknown}>} apartmentRows
 * @param {Array<{storage_path?: unknown}>} imageRows
 * @returns {Set<string>}
 */
export function extractReferencedListingPhotoNames(apartmentRows = [], imageRows = []) {
  const names = new Set();
  const collect = (value) => {
    const name = objectNameFromReference(value);
    if (name) names.add(name);
  };
  for (const row of apartmentRows ?? []) {
    const images = Array.isArray(row?.images) ? row.images : [];
    for (const image of images) collect(image);
  }
  for (const row of imageRows ?? []) collect(row?.storage_path);
  return names;
}

/**
 * @param {{name: string, referenced: boolean}} input
 * @returns {{action: "remove"|"keep", reason: string}}
 */
export function classifyPublicPhoto({ name, referenced }) {
  if (typeof name !== "string" || name.trim() === "") {
    return { action: "keep", reason: "invalid object name" };
  }
  if (name.startsWith(POLICY_EXCLUDED_PREFIX)) {
    return {
      action: "keep",
      reason: "external-discovery photos require an explicit policy decision; not auto-removed",
    };
  }
  if (!REVIEWED_REMOVAL_ALLOWLIST.includes(name)) {
    return { action: "keep", reason: "not in the reviewed removal allowlist" };
  }
  if (referenced) {
    return { action: "keep", reason: "referenced by listing data" };
  }
  return { action: "remove", reason: "unreferenced unapproved public copy" };
}

export function buildRemovalPlan(objects) {
  return objects.map((object) => ({ ...object, decision: classifyPublicPhoto(object) }));
}

export function removalTargets(objects) {
  return buildRemovalPlan(objects)
    .filter((entry) => entry.decision.action === "remove")
    .map((entry) => entry.name);
}
