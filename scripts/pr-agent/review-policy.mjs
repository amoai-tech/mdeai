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
