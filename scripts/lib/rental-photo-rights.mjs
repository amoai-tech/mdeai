/**
 * Pure decision logic for the SAN-1432 public photo-rights remediation.
 *
 * No I/O and no dependencies, so it is unit-testable with `node --test`.
 * The operator script (scripts/quarantine-unapproved-rental-photos.mjs) supplies
 * the storage listing and listing references; this module only decides.
 */

export const LISTING_PHOTOS_BUCKET = "listing-photos";
export const POLICY_EXCLUDED_PREFIX = "external-discovery/";

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
