/**
 * SAN-468 §5.4/§6.4 — argument validation for the operator-run certification evidence recorder.
 *
 * Pure and side-effect free so the refusal rules are unit-testable. The recorder
 * itself must never write without an explicit `--confirm-write=true`.
 */

export const FRESHNESS_STATUSES = ["active", "unconfirmed", "stale"];

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
  const sourceUrl = (args["source-url"] ?? "").trim() || null;
  const sourceType = (args["source-type"] ?? "").trim() || null;
  const verificationStatus = (args["verification-status"] ?? "").trim() || null;
  const verifiedBy = (args["verified-by"] ?? "").trim() || null;
  const notes = (args.notes ?? "").trim() || null;

  if (imageUrl && !isHttpUrl(imageUrl)) errors.push("--image-url must be an http(s) URL");
  if (sourceUrl && !isHttpUrl(sourceUrl)) errors.push("--source-url must be an http(s) URL");
  if (sourceType && !TOKEN_RE.test(sourceType)) {
    errors.push("--source-type must be 1-64 chars of [A-Za-z0-9_-]");
  }
  if (verificationStatus && !TOKEN_RE.test(verificationStatus)) {
    errors.push("--verification-status must be 1-64 chars of [A-Za-z0-9_-]");
  }
  if (verifiedBy && !UUID_RE.test(verifiedBy)) errors.push("--verified-by must be a UUID");

  return {
    ok: errors.length === 0,
    errors,
    value: {
      apartmentId,
      checkedAt,
      freshnessStatus,
      imageUrl,
      sourceType,
      sourceUrl,
      verificationStatus,
      verifiedBy,
      notes,
    },
  };
}
