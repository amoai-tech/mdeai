/**
 * SAN-468 §5.4/§6.4 — argument validation for the operator-run certification evidence recorder.
 *
 * Pure and side-effect free so the refusal rules are unit-testable. The recorder
 * itself must never write without an explicit `--confirm-write=true`.
 */

export const FRESHNESS_STATUSES = ["active", "unconfirmed", "stale"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      args[raw.slice(2)] = "true";
      continue;
    }
    args[raw.slice(2, eq)] = raw.slice(eq + 1);
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

  return {
    ok: errors.length === 0,
    errors,
    value: {
      apartmentId,
      checkedAt,
      freshnessStatus,
      imageUrl: (args["image-url"] ?? "").trim() || null,
      sourceType: (args["source-type"] ?? "").trim() || null,
      sourceUrl: (args["source-url"] ?? "").trim() || null,
      verificationStatus: (args["verification-status"] ?? "").trim() || null,
      verifiedBy: (args["verified-by"] ?? "").trim() || null,
      notes: (args.notes ?? "").trim() || null,
    },
  };
}
