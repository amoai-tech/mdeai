/**
 * Shared outcome classification for the live Maps maintenance checks.
 *
 * Why this exists (SAN-1351 · MAP-SKILL-CI-001):
 * the external checks talk to Google/GitHub over the network. Before this module,
 * a transient provider outage and a genuinely moved or deleted reference both
 * produced the same undifferentiated failure, and the workflow wrapped every live
 * step in `continue-on-error: true` — so a *confirmed* drift still produced a GREEN
 * run. The weekly drift alarm could therefore never fail.
 *
 * This module separates the two concerns:
 *
 *   classification — WHAT happened (OK / DRIFT / BROKEN_REFERENCE / EXTERNAL_UNAVAILABLE)
 *   mode           — WHAT that means (strict fails on anything non-OK; advisory
 *                    tolerates only external unavailability)
 *
 * Confirmed drift is never downgraded in either mode.
 */

/** The four outcomes required by SAN-1351 Step 2. */
export const MAPS_CHECK_CLASSES = Object.freeze({
  /** The check passed. */
  OK: "OK",
  /** Source reachable, but content moved/changed (upstream SHA advanced). */
  DRIFT: "DRIFT",
  /** Source reachable and definitively wrong: 404/410/gone, or a broken local contract. */
  BROKEN_REFERENCE: "BROKEN_REFERENCE",
  /** Could not obtain evidence: timeout, DNS, connection reset, 429, 5xx. */
  EXTERNAL_UNAVAILABLE: "EXTERNAL_UNAVAILABLE",
});

/** Execution modes required by SAN-1351 Step 3. */
export const MAPS_CHECK_MODES = Object.freeze({
  /** Any non-OK classification fails the run. Used by scheduled maintenance. */
  STRICT: "strict",
  /** Only DRIFT / BROKEN_REFERENCE fail the run; EXTERNAL_UNAVAILABLE is reported. */
  ADVISORY: "advisory",
});

/** Retryable transport statuses. Mirrors network-retry.mjs's transient set. */
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Resolve the execution mode from an environment value.
 * Unknown or missing values fall back to strict so a misconfiguration cannot
 * silently weaken drift detection.
 *
 * @param {string | undefined} raw
 * @returns {"strict" | "advisory"}
 */
export function resolveCheckMode(raw) {
  return String(raw ?? "").trim().toLowerCase() === MAPS_CHECK_MODES.ADVISORY
    ? MAPS_CHECK_MODES.ADVISORY
    : MAPS_CHECK_MODES.STRICT;
}

/**
 * Classify a non-2xx HTTP response.
 * 404/410 and other definitive client errors are broken references; transport
 * and rate-limit statuses are external unavailability.
 *
 * @param {number} status
 * @returns {string}
 */
export function classifyHttpStatus(status) {
  if (status >= 200 && status < 300) return MAPS_CHECK_CLASSES.OK;
  if (TRANSIENT_HTTP_STATUSES.has(status)) return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
  return MAPS_CHECK_CLASSES.BROKEN_REFERENCE;
}

/**
 * Classify a thrown fetch/exec error.
 * Timeouts, aborts, DNS and socket failures mean we could not obtain evidence,
 * so they are external unavailability rather than a broken reference.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function classifyFetchError(error) {
  if (error && typeof error === "object") {
    const name = "name" in error ? String(error.name) : "";
    if (name === "AbortError" || name === "TimeoutError") return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
    const code = "code" in error ? String(error.code) : "";
    if (/^(EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|UND_ERR|EPIPE)$/.test(code)) {
      return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
    }
  }
  return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
}

/**
 * Decide the process exit code for a set of classifications.
 *
 * strict   — any non-OK classification fails (exit 2)
 * advisory — only DRIFT / BROKEN_REFERENCE fail (exit 2);
 *            EXTERNAL_UNAVAILABLE is reported but does not fail (exit 0)
 *
 * @param {string} mode
 * @param {readonly string[]} classifications
 * @returns {0 | 2}
 */
export function resolveExitCode(mode, classifications) {
  const failing = classifications.filter((c) => c !== MAPS_CHECK_CLASSES.OK);
  if (failing.length === 0) return 0;
  if (mode === MAPS_CHECK_MODES.ADVISORY) {
    const confirmed = failing.some(
      (c) => c === MAPS_CHECK_CLASSES.DRIFT || c === MAPS_CHECK_CLASSES.BROKEN_REFERENCE,
    );
    return confirmed ? 2 : 0;
  }
  return 2;
}

/**
 * Count classifications by class.
 *
 * @param {readonly string[]} classifications
 * @returns {Record<string, number>}
 */
export function tallyClassifications(classifications) {
  const tally = {
    [MAPS_CHECK_CLASSES.OK]: 0,
    [MAPS_CHECK_CLASSES.DRIFT]: 0,
    [MAPS_CHECK_CLASSES.BROKEN_REFERENCE]: 0,
    [MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE]: 0,
  };
  for (const c of classifications) if (c in tally) tally[c] += 1;
  return tally;
}

/**
 * Emit the machine-readable summary line. Always printed so a scheduled run's
 * log states the classification and the resulting decision.
 *
 * @param {string} checkName
 * @param {string} mode
 * @param {readonly string[]} classifications
 * @returns {{line: string, tally: Record<string, number>, exitCode: 0 | 2}}
 */
export function reportCheckSummary(checkName, mode, classifications) {
  const tally = tallyClassifications(classifications);
  const exitCode = resolveExitCode(mode, classifications);
  const line = [
    "MAPS_CHECK_SUMMARY",
    `check=${checkName}`,
    `mode=${mode}`,
    `OK=${tally.OK}`,
    `DRIFT=${tally.DRIFT}`,
    `BROKEN_REFERENCE=${tally.BROKEN_REFERENCE}`,
    `EXTERNAL_UNAVAILABLE=${tally.EXTERNAL_UNAVAILABLE}`,
    `result=${exitCode === 0 ? "PASS" : "FAIL"}`,
  ].join(" ");
  return { line, tally, exitCode };
}
