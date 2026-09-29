// Records that a fresh PR-Agent review was published for an exact base/head pair, and decides
// whether a push can reuse an incremental review.
//
// What this proves: a review result exists for the current base context, so a stale review cannot
// be mistaken for a current one.
// What this does NOT prove: that the model's findings are correct, complete, or free of false
// positives. Deterministic CI (`floor`), required checks, and human/independent review remain the
// real certification. The exported names below are kept for shared-workflow compatibility; the
// operator-visible wording states only what is actually established.
const SHA_RE = /^[0-9a-f]{40}$/i;
export const CERT_HISTORY_MARKER = "<!-- mde-pr-agent-cert-history -->";

function assertSha(value, label) {
  if (!SHA_RE.test(value ?? "")) throw new Error(`${label} must be a 40-character git SHA`);
}

export function certificationMarker({ baseSha, headSha }) {
  assertSha(baseSha, "baseSha");
  assertSha(headSha, "headSha");
  return `<!-- mde-pr-agent-cert base=${baseSha.toLowerCase()} head=${headSha.toLowerCase()} -->`;
}

export function hasCertificationForBase(body, baseSha) {
  assertSha(baseSha, "baseSha");
  const markerPrefix = `<!-- mde-pr-agent-cert base=${baseSha.toLowerCase()} head=`;
  return (body ?? "").toLowerCase().includes(markerPrefix);
}

/**
 * True when a recorded review marker names this exact head. Used to pick the one review comment
 * that belongs to a target head, so an earlier push's review is never scored as if it were current.
 */
export function hasCertificationForHead(body, headSha) {
  assertSha(headSha, "headSha");
  return (body ?? "").toLowerCase().includes(`head=${headSha.toLowerCase()}`);
}

/**
 * Select the single review comment that the recorded marker for `headSha` certified.
 *
 * The verification job writes the marker immediately after a review completes, so the certified
 * review is the newest review comment published no later than that marker. Returns the comment and
 * the marker, or a reason — never a guess and never more than one comment.
 */
export function selectCertifiedReviewForHead({ comments, headSha, reviewMarkers }) {
  assertSha(headSha, "headSha");
  const isBot = (comment) => comment?.user?.login === "github-actions[bot]";
  const markers = (comments ?? []).filter(
    (comment) => isBot(comment) && hasCertificationForHead(comment.body ?? "", headSha),
  );
  if (markers.length === 0) {
    return { comment: null, reason: `no recorded review marker for head ${headSha}` };
  }
  const marker = markers.reduce((left, right) =>
    new Date(right.updated_at).getTime() > new Date(left.updated_at).getTime() ? right : left,
  );
  const markerTime = new Date(marker.updated_at).getTime();
  const candidates = (comments ?? []).filter(
    (comment) =>
      isBot(comment) &&
      (reviewMarkers ?? []).some((token) => (comment.body ?? "").includes(token)) &&
      new Date(comment.updated_at).getTime() <= markerTime,
  );
  if (candidates.length === 0) {
    return { comment: null, reason: `no review comment published before the marker for head ${headSha}` };
  }
  const comment = candidates.reduce((left, right) =>
    new Date(right.updated_at).getTime() > new Date(left.updated_at).getTime() ? right : left,
  );
  return { comment, marker, consideredReviews: candidates.length, reason: "certified review selected" };
}

export function appendCertification(body, { baseSha, headSha }) {
  const marker = certificationMarker({ baseSha, headSha });
  if ((body ?? "").includes(marker)) return body;
  const prefix = (body ?? "").includes(CERT_HISTORY_MARKER)
    ? body.trimEnd()
    : `${CERT_HISTORY_MARKER}\nFresh PR-Agent reviews recorded for exact base/head:`;
  return `${prefix}\n${marker}\n`;
}

export function selectReviewCommand({ action, certificationBodies, baseSha }) {
  if (action !== "synchronize") return "/review";
  const sameBase = certificationBodies.some((body) => hasCertificationForBase(body, baseSha));
  return sameBase ? "/review -i" : "/review";
}

function isBotComment(comment) {
  return comment?.user?.login === "github-actions[bot]";
}

function isIncrementalSkipNotice(body) {
  return body.includes("Incremental Review Skipped") && (
    body.includes("No files were changed since the previous PR Review") ||
    body.includes("No files were changed since the [previous PR Review](")
  );
}

export function verifyReviewResult({ comments, startedAt, reviewCommand, baseSha }) {
  const expectedMarker = reviewCommand === "/review -i"
    ? "<!-- pr-agent:review:incremental -->"
    : "<!-- pr-agent:review:full -->";
  const priorSameBaseCertification = comments.some((comment) =>
    isBotComment(comment) &&
    new Date(comment.updated_at).getTime() < startedAt &&
    hasCertificationForBase(comment.body ?? "", baseSha),
  );

  const fresh = comments.some((comment) => {
    if (!isBotComment(comment) || new Date(comment.updated_at).getTime() < startedAt) return false;
    const body = comment.body ?? "";
    const canonical = body.includes(expectedMarker);
    const standalone =
      body.includes("## Standalone PR Review") &&
      body.includes("PR-Agent could not safely update the persistent review") &&
      body.includes("## MDE PR Review");
    const incrementalSkipped =
      reviewCommand === "/review -i" &&
      priorSameBaseCertification &&
      isIncrementalSkipNotice(body);
    return canonical || standalone || incrementalSkipped;
  });

  return {
    ok: fresh,
    reason: fresh ? "fresh review result verified" : "PR-Agent did not publish an acceptable fresh review result",
  };
}
