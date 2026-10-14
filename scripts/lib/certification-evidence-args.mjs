/**
 * SAN-468 §5.4/§6.4 — argument validation for the operator-run certification evidence recorder.
 *
 * Pure and side-effect free so the refusal rules are unit-testable. The recorder
 * itself must never write without an explicit `--confirm-write=true`.
 */

export const FRESHNESS_STATUSES = ["active", "unconfirmed", "stale"];
/** Matches the live property_verifications.status contract. */
export const VERIFICATION_STATUSES = ["pending", "verified", "rejected", "revoked"];
/** SAN-468 §5.4: matches the live rental_listing_images.rights_status contract. */
export const IMAGE_RIGHTS_STATUSES = ["unverified", "authorized", "revoked"];
/** SAN-1431 §4.2: matches property_verifications.metadata owner_control / coordinates. */
export const CONTROL_VALUES = ["verified", "unverified"];
/** SAN-1431 §4.2: matches property_verifications.metadata publish/viewings permissions. */
export const PERMISSION_VALUES = ["granted", "not_granted"];
/** Neighborhood placeholders the canonical launch gate rejects (keep in sync). */
export const NEIGHBORHOOD_PLACEHOLDERS = [
  "pending verification",
  "pending",
  "unknown",
  "tbd",
  "unreviewed",
  "n/a",
  "na",
  "por verificar",
  "sin verificar",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Provider/evidence tokens: bounded, no whitespace or shell/path characters. */
const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ ok: boolean, errors: string[], value: Record<string, string | null> }}
 */
/** A real Gregorian date written YYYY-MM-DD; a bare regex would accept 2026-02-31. */
function isRealCalendarDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function parseCertificationEvidenceArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) {
      const key = raw.slice(2);
      if (key !== "database-url") args[key] = "true";
      continue;
    }
    const key = raw.slice(2, eq);
    // The recorder reads --database-url separately; it is not a certification fact.
    if (key === "database-url") continue;
    args[key] = raw.slice(eq + 1);
  }

  const errors = [];

  const apartmentId = (args["apartment-id"] ?? "").trim();
  if (!UUID_RE.test(apartmentId)) errors.push("--apartment-id must be a UUID");

  const checkedAt = (args["checked-at"] ?? "").trim();
  if (!checkedAt) {
    errors.push("--checked-at is required (ISO timestamp of the real check)");
  } else if (Number.isNaN(Date.parse(checkedAt))) {
    errors.push("--checked-at must be a parseable ISO timestamp");
  }

  const freshnessStatus = (args["freshness-status"] ?? "").trim();
  if (!FRESHNESS_STATUSES.includes(freshnessStatus)) {
    errors.push(`--freshness-status must be one of ${FRESHNESS_STATUSES.join("|")}`);
  }

  if (args["confirm-write"] !== "true") {
    errors.push("--confirm-write=true is required (this writes production evidence)");
  }

  const imageUrl = (args["image-url"] ?? "").trim() || null;
  const imageRights = (args["image-rights"] ?? "").trim() || null;
  const sourceUrl = (args["source-url"] ?? "").trim() || null;
  const sourceType = (args["source-type"] ?? "").trim() || null;
  const verificationStatus = (args["verification-status"] ?? "").trim() || null;
  const verifiedBy = (args["verified-by"] ?? "").trim() || null;
  const notes = (args.notes ?? "").trim() || null;
  const ownerControl = (args["owner-control"] ?? "").trim() || null;
  const publishPermission = (args["publish-permission"] ?? "").trim() || null;
  const viewingsPermission = (args["viewings-permission"] ?? "").trim() || null;
  const coordinateReceipt = (args["coordinate-receipt"] ?? "").trim() || null;
  const moveInVerifiedFor = (args["move-in-verified-for"] ?? "").trim() || null;
  const moveInEvidence = (args["move-in-evidence"] ?? "").trim() || null;
  const neighborhood = (args["neighborhood"] ?? "").trim() || null;
  const updateVerification = args["update-verification"] === "true";

  if (imageUrl && !isHttpUrl(imageUrl)) errors.push("--image-url must be an http(s) URL");
  if (imageRights && !IMAGE_RIGHTS_STATUSES.includes(imageRights)) {
    errors.push(`--image-rights must be one of ${IMAGE_RIGHTS_STATUSES.join("|")}`);
  }
  if (imageRights && !imageUrl) {
    errors.push("--image-rights requires --image-url (photo rights describe a specific photo)");
  }
  if (sourceUrl && !isHttpUrl(sourceUrl)) errors.push("--source-url must be an http(s) URL");
  if (sourceType && !TOKEN_RE.test(sourceType)) {
    errors.push("--source-type must be 1-64 chars of [A-Za-z0-9_-]");
  }
  if (verificationStatus && !VERIFICATION_STATUSES.includes(verificationStatus)) {
    errors.push(`--verification-status must be one of ${VERIFICATION_STATUSES.join("|")}`);
  }
  if (Boolean(sourceType) !== Boolean(sourceUrl)) {
    errors.push("--source-type and --source-url must be provided together");
  }
  if (verifiedBy && !UUID_RE.test(verifiedBy)) errors.push("--verified-by must be a UUID");
  if (verificationStatus && !verifiedBy) {
    errors.push("--verified-by is required with --verification-status (a verification needs a verifier)");
  }
  if (notes && notes.length > 2000) errors.push("--notes must be at most 2000 characters");

  if (ownerControl && !CONTROL_VALUES.includes(ownerControl)) {
    errors.push(`--owner-control must be one of ${CONTROL_VALUES.join("|")}`);
  }
  if (coordinateReceipt && !CONTROL_VALUES.includes(coordinateReceipt)) {
    errors.push(`--coordinate-receipt must be one of ${CONTROL_VALUES.join("|")}`);
  }
  if (publishPermission && !PERMISSION_VALUES.includes(publishPermission)) {
    errors.push(`--publish-permission must be one of ${PERMISSION_VALUES.join("|")}`);
  }
  if (viewingsPermission && !PERMISSION_VALUES.includes(viewingsPermission)) {
    errors.push(`--viewings-permission must be one of ${PERMISSION_VALUES.join("|")}`);
  }
  // SAN-486: a future move-in date is proven by a receipt that names THAT exact date and the
  // evidence reviewed; a generic "availability verified" flag is deliberately not supported.
  if (moveInVerifiedFor && !isRealCalendarDate(moveInVerifiedFor)) {
    errors.push("--move-in-verified-for must be a real calendar date, YYYY-MM-DD");
  }
  if (Boolean(moveInVerifiedFor) !== Boolean(moveInEvidence)) {
    errors.push("--move-in-verified-for and --move-in-evidence must be provided together");
  }
  if (moveInEvidence && moveInEvidence.length > 500) {
    errors.push("--move-in-evidence must be at most 500 characters");
  }
  const hasListingApproval = Boolean(
    ownerControl || publishPermission || viewingsPermission || coordinateReceipt || moveInVerifiedFor,
  );
  if (hasListingApproval && verificationStatus !== "verified") {
    errors.push(
      "--owner-control/--publish-permission/--viewings-permission/--coordinate-receipt/--move-in-verified-for require --verification-status=verified (they are listing-specific approvals)",
    );
  }
  if (neighborhood) {
    if (neighborhood.length > 120) errors.push("--neighborhood must be at most 120 characters");
    if (NEIGHBORHOOD_PLACEHOLDERS.includes(neighborhood.toLowerCase())) {
      errors.push("--neighborhood must be a real neighborhood, not a placeholder");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      apartmentId,
      checkedAt,
      freshnessStatus,
      imageUrl,
      imageRights,
      sourceType,
      sourceUrl,
      verificationStatus,
      verifiedBy,
      notes,
      ownerControl,
      publishPermission,
      viewingsPermission,
      coordinateReceipt,
      moveInVerifiedFor,
      moveInEvidence,
      neighborhood,
      updateVerification,
    },
  };
}
