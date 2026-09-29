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
// Matches the marker `certificationMarker()` writes as a whole shape, rather than a bare
// `head=<sha>` substring. PR-Agent reviews embed the diff they are reviewing, so a review comment
// can contain marker-shaped text — including a real, non-placeholder one on a PR that edits a
// fixture. Only a comment carrying the marker verbatim may certify a head.
const CERT_MARKER_RE = /<!--\s*mde-pr-agent-cert\s+base=([0-9a-f]{40})\s+head=([0-9a-f]{40})\s*-->/gi;

function assertSha(value, label) {
  if (!SHA_RE.test(value ?? "")) throw new Error(`${label} must be a 40-character git SHA`);
}

/** Every certification marker in a body, normalized to lowercase `{ baseSha, headSha }` pairs. */
export function certificationMarkers(body) {
  return [...(body ?? "").matchAll(CERT_MARKER_RE)].map((match) => ({
    baseSha: match[1].toLowerCase(),
    headSha: match[2].toLowerCase(),
  }));
}

export function certificationMarker({ baseSha, headSha }) {
  assertSha(baseSha, "baseSha");
  assertSha(headSha, "headSha");
  return `<!-- mde-pr-agent-cert base=${baseSha.toLowerCase()} head=${headSha.toLowerCase()} -->`;
}

export function hasCertificationForBase(body, baseSha) {
  assertSha(baseSha, "baseSha");
  const wanted = baseSha.toLowerCase();
  return certificationMarkers(body).some((marker) => marker.baseSha === wanted);
}

/**
 * True when a recorded review marker names this exact head. Used to pick the one review comment
 * that belongs to a target head, so an earlier push's review is never scored as if it were current.
 */
export function hasCertificationForHead(body, headSha) {
  assertSha(headSha, "headSha");
  const wanted = headSha.toLowerCase();
  return certificationMarkers(body).some((marker) => marker.headSha === wanted);
}

/**
 * The standalone fallback review PR-Agent publishes when it cannot update the persistent comment.
 * It is a real review result — `verifyReviewResult` accepts it as fresh — but it carries no review
 * token and no persistent state, so it records no head of its own.
 */
export function isStandaloneReview(body) {
  return (
    (body ?? "").includes("## Standalone PR Review") &&
    (body ?? "").includes("PR-Agent could not safely update the persistent review") &&
    (body ?? "").includes("## MDE PR Review")
  );
}

/**
 * Select the single review comment that belongs to `headSha`, or refuse.
 *
 * The marker comment is a single comment that is *edited in place*, so it accumulates every head it
 * has ever certified and its timestamp is the time of its **last** certification — not this head's.
 * A boundary derived from it therefore hands back the newest review whatever head that review
 * belongs to, which is how a canary scores the wrong review.
 *
 * Identity is therefore established from the strongest available evidence, and the basis is
 * reported in `headEvidence`:
 *
 *   - `review-recorded` — the review's own persistent state names this head (`headShaOf`);
 *   - `newest-certified-head` — nothing names the head, but this head is the **last** marker in the
 *     newest certification comment, so no later certification exists to confuse the boundary with;
 *   - `unconfirmed` — neither holds, and only `allowUnconfirmedHead` will return a guess.
 *
 * @param {object} options
 * @param {unknown[]} options.comments
 * @param {string} options.headSha
 * @param {string[]} options.reviewMarkers
 * @param {(body: string) => (string | null | undefined)} [options.headShaOf] reads a review's own
 *   record of the head it reviewed; absent means no review can confirm a head.
 * @param {boolean} [options.allowUnconfirmedHead] trust the boundary even when this head is not the
 *   newest certification. Only for an operator who holds separate proof; never a default.
 */
export function selectCertifiedReviewForHead({
  comments,
  headSha,
  reviewMarkers,
  headShaOf,
  allowUnconfirmedHead = false,
}) {
  assertSha(headSha, "headSha");
  const headOf = headShaOf ?? (() => null);
  const isBot = (comment) => comment?.user?.login === "github-actions[bot]";
  const reviewTokens = reviewMarkers ?? [];
  const carriesReviewMarker = (body) => reviewTokens.some((token) => body.includes(token));
  const isReview = (body) => carriesReviewMarker(body) || isStandaloneReview(body);
  // A review comment is never a certification record, even when it quotes a marker. The marker
  // comment names heads while carrying no review token; without this check a review that quoted a
  // marker could bound the candidate window — and be returned — as if it were the certification.
  const markers = (comments ?? []).filter(
    (comment) =>
      isBot(comment) &&
      !isReview(comment.body ?? "") &&
      hasCertificationForHead(comment.body ?? "", headSha),
  );
  if (markers.length === 0) {
    return {
      comment: null,
      headConfirmed: false,
      headEvidence: "none",
      reason: `no recorded review marker for head ${headSha}`,
    };
  }
  const newest = (list) =>
    list.reduce((left, right) =>
      new Date(right.updated_at).getTime() > new Date(left.updated_at).getTime() ? right : left,
    );
  const marker = newest(markers);
  const markerTime = new Date(marker.updated_at).getTime();
  // `appendCertification` appends, so the last marker in the newest certification comment is the
  // most recent certification. A boundary is only sound for that head.
  const latestCertifiedHead = certificationMarkers(marker.body ?? "").at(-1)?.headSha ?? null;
  const candidates = (comments ?? []).filter(
    (comment) =>
      isBot(comment) && isReview(comment.body ?? "") && new Date(comment.updated_at).getTime() <= markerTime,
  );
  if (candidates.length === 0) {
    return {
      comment: null,
      headConfirmed: false,
      headEvidence: "none",
      reason: `no review comment published before the marker for head ${headSha}`,
    };
  }
  const named = candidates.filter(
    (comment) => String(headOf(comment.body ?? "") ?? "").toLowerCase() === headSha,
  );
  if (named.length > 0) {
    return {
      comment: newest(named),
      marker,
      headConfirmed: true,
      headEvidence: "review-recorded",
      consideredReviews: candidates.length,
      reason: `review records head ${headSha}${named.length > 1 ? ` (${named.length} did; newest selected)` : ""}`,
    };
  }
  if (latestCertifiedHead === headSha) {
    return {
      comment: newest(candidates),
      marker,
      headConfirmed: true,
      headEvidence: "newest-certified-head",
      consideredReviews: candidates.length,
      reason: `head ${headSha} is the newest certification, so the boundary is unambiguous; the review carries no head of its own`,
    };
  }
  if (!allowUnconfirmedHead) {
    return {
      comment: null,
      headConfirmed: false,
      headEvidence: "unconfirmed",
      consideredReviews: candidates.length,
      reason: `no review among ${candidates.length} candidate(s) records head ${headSha}, and it is not the newest certification — refusing to guess`,
    };
  }
  return {
    comment: newest(candidates),
    marker,
    headConfirmed: false,
    headEvidence: "unconfirmed",
    consideredReviews: candidates.length,
    reason: `selected from the marker boundary only; not the newest certification and no review records head ${headSha} (unconfirmed)`,
  };
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
    const incrementalSkipped =
      reviewCommand === "/review -i" &&
      priorSameBaseCertification &&
      isIncrementalSkipNotice(body);
    return canonical || incrementalSkipped;
  });

  if (fresh) return { ok: true, reason: "fresh review result verified" };

  // SAN-1332 step 4 (interim). A standalone fallback is recognised only from prose shape and
  // carries no head of its own, so accepting it means a review of commit A certifies commit B —
  // whatever head this run actually reviewed. Refuse it rather than guess, and say what to do.
  // Replaced by exact base/head/command envelope acceptance once the shared publisher emits one.
  const standalone = comments.some(
    (comment) =>
      isBotComment(comment) &&
      new Date(comment.updated_at).getTime() >= startedAt &&
      isStandaloneReview(comment.body ?? ""),
  );
  return {
    ok: false,
    reason: standalone
      ? "STALE_HEAD: PR-Agent published only a standalone fallback review, which proves no head of " +
        "its own — rerun /review so a review with exact base/head identity is published"
      : "PR-Agent did not publish an acceptable fresh review result",
  };
}
