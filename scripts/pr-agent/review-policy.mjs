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

export const REVIEW_ENVELOPE_VERSION = 1;
export const REVIEW_ENVELOPE_NAMESPACE = "<!-- mde-agent-review:";
const REVIEW_COMMANDS = new Set(["/review", "/review -i"]);
const REVIEW_TYPES = new Set(["canonical", "standalone"]);

export function reviewEnvelope({ baseSha, headSha, command, type }) {
  assertSha(baseSha, "baseSha");
  assertSha(headSha, "headSha");
  if (!REVIEW_COMMANDS.has(command)) throw new Error(`unsupported review command: ${command}`);
  if (!REVIEW_TYPES.has(type)) throw new Error(`unsupported review type: ${type}`);
  return `<!-- mde-agent-review:v${REVIEW_ENVELOPE_VERSION} base=${baseSha.toLowerCase()} head=${headSha.toLowerCase()} command="${command}" type=${type} -->`;
}

export function parseReviewEnvelope(body) {
  const text = body ?? "";
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(REVIEW_ENVELOPE_NAMESPACE)) {
    return { valid: false, code: "INVALID_ENVELOPE", reason: "review result is missing the trusted ReviewEnvelope prefix" };
  }

  const lineEnd = trimmed.indexOf("\n");
  const firstLine = (lineEnd === -1 ? trimmed : trimmed.slice(0, lineEnd)).trim();
  if (!firstLine.endsWith("-->")) {
    return { valid: false, code: "INVALID_ENVELOPE", reason: "ReviewEnvelope marker is malformed" };
  }
  if (!/\shead=/.test(firstLine)) {
    return { valid: false, code: "MISSING_HEAD", reason: "ReviewEnvelope is missing head SHA" };
  }

  const match = firstLine.match(/^<!--\s*mde-agent-review:v(\d+)\s+base=([^\s]+)\s+head=([^\s]+)\s+command="([^"]+)"\s+type=([^\s]+)\s*-->$/i);
  if (!match) {
    return { valid: false, code: "INVALID_ENVELOPE", reason: "ReviewEnvelope does not match schema v1" };
  }
  const [, versionText, baseSha, headSha, command, type] = match;
  const version = Number(versionText);
  if (version !== REVIEW_ENVELOPE_VERSION || !SHA_RE.test(baseSha) || !SHA_RE.test(headSha) || !REVIEW_TYPES.has(type)) {
    return { valid: false, code: "INVALID_ENVELOPE", reason: "ReviewEnvelope contains an unsupported version, SHA, or review type" };
  }

  const remainder = lineEnd === -1 ? "" : trimmed.slice(lineEnd + 1);
  if (remainder.trimStart().startsWith(REVIEW_ENVELOPE_NAMESPACE)) {
    return { valid: false, code: "INVALID_ENVELOPE", reason: "review result contains duplicate leading ReviewEnvelope markers" };
  }

  return {
    valid: true,
    code: "OK",
    version,
    baseSha: baseSha.toLowerCase(),
    headSha: headSha.toLowerCase(),
    command,
    type,
    body: remainder,
  };
}

export function stampReviewEnvelope(body, envelope) {
  const text = body ?? "";
  if (!text.trim()) throw new Error("cannot stamp an empty PR-Agent review");
  const parsed = parseReviewEnvelope(text);
  const unwrapped = parsed.valid ? parsed.body : text;
  return `${reviewEnvelope(envelope)}\n${unwrapped.trimStart()}`;
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
 * It is a real review result, but it is certifiable only after the trusted shared workflow stamps
 * the exact ReviewEnvelope. Prose shape alone is never identity proof.
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

export function findFreshReviewCandidates({ comments, startedAt }) {
  return (comments ?? [])
    .filter((comment) => isBotComment(comment) && new Date(comment.updated_at).getTime() >= startedAt)
    .map((comment) => {
      const rawBody = comment.body ?? "";
      const envelope = parseReviewEnvelope(rawBody);
      const body = envelope.valid ? envelope.body : rawBody;
      if (body.includes("<!-- pr-agent:review:full -->")) {
        return { comment, kind: "canonical", publishedCommand: "/review", envelope };
      }
      if (body.includes("<!-- pr-agent:review:incremental -->")) {
        return { comment, kind: "canonical", publishedCommand: "/review -i", envelope };
      }
      if (isIncrementalSkipNotice(body)) {
        return { comment, kind: "canonical", publishedCommand: "/review -i", envelope, incrementalSkipped: true };
      }
      if (isStandaloneReview(body)) return { comment, kind: "standalone", publishedCommand: envelope.valid ? envelope.command : null, envelope };
      return null;
    })
    .filter(Boolean);
}

function envelopeFailure(envelope, { baseSha, headSha, reviewCommand, kind, publishedCommand }) {
  if (!envelope.valid) return { ok: false, code: envelope.code, reason: envelope.reason };
  if (envelope.baseSha !== baseSha.toLowerCase()) {
    return { ok: false, code: "WRONG_BASE", reason: `ReviewEnvelope base ${envelope.baseSha} does not match expected ${baseSha.toLowerCase()}` };
  }
  if (envelope.headSha !== headSha.toLowerCase()) {
    return { ok: false, code: "STALE_HEAD", reason: `ReviewEnvelope head ${envelope.headSha} does not match current PR head ${headSha.toLowerCase()}` };
  }
  if (!REVIEW_COMMANDS.has(envelope.command) || envelope.command !== reviewCommand || (publishedCommand && publishedCommand !== reviewCommand)) {
    return { ok: false, code: "WRONG_COMMAND", reason: `ReviewEnvelope/published command ${envelope.command}/${publishedCommand ?? "unknown"} does not match expected ${reviewCommand}` };
  }
  if (envelope.type !== kind) {
    return { ok: false, code: "INVALID_ENVELOPE", reason: `ReviewEnvelope type ${envelope.type} does not match published ${kind} review` };
  }
  if (!envelope.body.trim()) {
    return { ok: false, code: "EMPTY_REVIEW", reason: "ReviewEnvelope contains no review body" };
  }
  return null;
}

export function verifyReviewResult({ comments, startedAt, reviewCommand, baseSha, headSha }) {
  assertSha(baseSha, "baseSha");
  assertSha(headSha, "headSha");
  if (!REVIEW_COMMANDS.has(reviewCommand)) {
    return { ok: false, code: "WRONG_COMMAND", reason: `unsupported expected review command: ${reviewCommand}` };
  }

  const priorSameBaseCertification = (comments ?? []).some((comment) =>
    isBotComment(comment) &&
    new Date(comment.updated_at).getTime() < startedAt &&
    hasCertificationForBase(comment.body ?? "", baseSha),
  );
  const candidates = findFreshReviewCandidates({ comments, startedAt });
  if (candidates.length === 0) {
    return { ok: false, code: "NO_REVIEW", reason: "PR-Agent has not published a fresh review result yet" };
  }

  const newestFirst = [...candidates].sort(
    (a, b) => new Date(b.comment.updated_at).getTime() - new Date(a.comment.updated_at).getTime(),
  );
  for (const candidate of newestFirst) {
    if (candidate.incrementalSkipped && !priorSameBaseCertification) continue;
    const failure = envelopeFailure(candidate.envelope, {
      baseSha,
      headSha,
      reviewCommand,
      kind: candidate.kind,
      publishedCommand: candidate.publishedCommand,
    });
    if (!failure) {
      return {
        ok: true,
        code: "OK",
        reason: `fresh ${candidate.kind} review verified for exact base/head`,
        comment: candidate.comment,
        type: candidate.kind,
      };
    }
  }

  const candidate = newestFirst[0];
  if (candidate.incrementalSkipped && !priorSameBaseCertification) {
    return { ok: false, code: "WRONG_BASE", reason: "incremental skip has no previous certification for this base" };
  }
  return envelopeFailure(candidate.envelope, {
    baseSha,
    headSha,
    reviewCommand,
    kind: candidate.kind,
    publishedCommand: candidate.publishedCommand,
  }) ?? { ok: false, code: "INVALID_ENVELOPE", reason: "review result is ambiguous" };
}
