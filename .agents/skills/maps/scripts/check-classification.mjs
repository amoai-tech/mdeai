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

/**
 * Statuses worth **retrying**. Mirrors network-retry.mjs's transient set: retrying a
 * 501/505/507 would be pointless, so this deliberately stays narrower than the set of
 * statuses that count as external unavailability when classifying (see classifyHttpStatus).
 */
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Transport errno codes: we could not obtain evidence about the reference. */
const TRANSPORT_ERROR_CODES =
  /^(EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE|ENETUNREACH|EHOSTUNREACH)$/;

/**
 * Transport messages git forwards from libcurl when it cannot reach the remote.
 * Git exits 128 for *every* fatal error — including "repository not found", which is a
 * genuine broken reference — so the exit code alone cannot decide the class.
 */
const TRANSPORT_STDERR =
  /(Could not resolve host|Failed to connect to|Connection refused|Connection (?:timed out|reset by peer)|Operation timed out|Empty reply from server|Recv failure|Send failure|SSL connect error|SSL_ERROR|gnutls_handshake|The requested URL returned error: 5\d\d|unexpected disconnect|early EOF|RPC failed)/i;

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
 *
 * Transport and rate-limit statuses are external unavailability; everything else
 * is treated as a broken reference. That deliberately includes 401/403: every URL
 * this check follows is a *public* canonical Google/canonical-library document, so
 * an authorization failure means the reference is no longer publicly reachable —
 * which is exactly the drift this alarm exists to surface. The link checker already
 * retries 403/405 once as a GET before classifying, so a HEAD-only rejection is not
 * mistaken for drift. If an authenticated reference is ever added to the index,
 * extend this function rather than silently reclassifying all client errors.
 *
 * @param {number} status
 * @returns {string}
 */
export function classifyHttpStatus(status) {
  if (status >= 200 && status < 300) return MAPS_CHECK_CLASSES.OK;
  // A 5xx means the server failed to answer, so the reference's existence is unproven —
  // it is not evidence that the reference moved. Every 5xx counts as external
  // unavailability here, even though only the retryable subset is worth retrying.
  const isServerError = status >= 500 && status < 600;
  if (isServerError || TRANSIENT_HTTP_STATUSES.has(status)) {
    return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
  }
  return MAPS_CHECK_CLASSES.BROKEN_REFERENCE;
}

/** True when this error object itself is a transport failure, not a local defect. */
function isTransportFailure(error) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const code = "code" in error ? String(error.code) : "";
  // Undici emits prefixed codes (UND_ERR_SOCKET, UND_ERR_HEADERS_TIMEOUT, …),
  // so match the family rather than the bare "UND_ERR" literal.
  return TRANSPORT_ERROR_CODES.test(code) || code.startsWith("UND_ERR");
}

/**
 * Classify a thrown fetch/exec error.
 * Timeouts, aborts, DNS and socket failures mean we could not obtain evidence,
 * so they are external unavailability rather than a broken reference.
 *
 * Unrecognised errors fail **closed** as BROKEN_REFERENCE: an unknown throw is
 * far more likely to be a defect in this script (TypeError, ReferenceError) than
 * a provider outage, and classifying it as EXTERNAL_UNAVAILABLE would let a
 * genuine script bug exit 0 in advisory mode.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function classifyFetchError(error) {
  if (error && typeof error === "object") {
    if (isTransportFailure(error)) return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
    // `fetch` rejects with `TypeError: fetch failed` and hangs the real transport
    // error off `cause`, so a DNS/socket failure is only visible there. `cause` is
    // consulted only when the outer error carries no code of its own: an error that
    // does carry one is authoritative, which keeps a local contract break such as
    // ENOENT out of the outage bucket.
    const code = "code" in error ? String(error.code) : "";
    if (!code && isTransportFailure(error.cause)) return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
  }
  return MAPS_CHECK_CLASSES.BROKEN_REFERENCE;
}

/**
 * Classify a failed child-process call (git over HTTPS).
 *
 * Git exits 128 for every fatal error, so a "repository not found" — a genuine broken
 * reference — is indistinguishable from an outage by exit code alone. Only the libcurl
 * transport messages in stderr are treated as external unavailability; everything else
 * stays on the fail-closed path.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function classifyExecError(error) {
  if (error && typeof error === "object") {
    // Our own `execFile` timeout kills the child, which produced no evidence at all.
    if ("signal" in error && error.signal) return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
    const stderr = "stderr" in error ? String(error.stderr ?? "") : "";
    if (stderr && TRANSPORT_STDERR.test(stderr)) return MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE;
  }
  return classifyFetchError(error);
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
