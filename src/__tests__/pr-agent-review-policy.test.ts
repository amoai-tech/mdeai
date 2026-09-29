import { describe, expect, it } from "vitest";
import {
  appendCertification,
  hasCertificationForBase,
  hasCertificationForHead,
  selectCertifiedReviewForHead,
  selectReviewCommand,
  verifyReviewResult,
} from "../../scripts/pr-agent/review-policy.mjs";

const BASE_A = "a".repeat(40);
const BASE_B = "b".repeat(40);
const HEAD_A = "c".repeat(40);
const RUN_STARTED = Date.parse("2026-09-20T01:00:00Z");

const REVIEW_MARKERS = ["<!-- pr-agent:review:full -->", "<!-- pr-agent:review:incremental -->"];
const REVIEW_FULL = "## MDE PR Review\n\n<!-- pr-agent:review:full -->\n\nbody";
const REVIEW_INCREMENTAL = "## Incremental MDE PR Review\n\n<!-- pr-agent:review:incremental -->\n\nbody";

/** The fallback PR-Agent publishes when it cannot update the persistent review: no token, no head. */
function standaloneReview(body: string) {
  return [
    "## Standalone PR Review",
    "",
    "_PR-Agent could not safely update the persistent review. This standalone result will not replace the canonical review._",
    "",
    "## MDE PR Review 🔍",
    "",
    body,
  ].join("\n");
}

function comment(body: string, updatedAt: string, login = "github-actions[bot]") {
  return { body, updated_at: updatedAt, user: { login } };
}

describe("PR-Agent certified-review selection for a head", () => {
  it("matches a head marker case-insensitively", () => {
    const marker = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    expect(hasCertificationForHead(marker, HEAD_A)).toBe(true);
    expect(hasCertificationForHead(marker, HEAD_A.toUpperCase())).toBe(true);
    expect(hasCertificationForHead(marker, BASE_B)).toBe(false);
  });

  it("selects exactly one review, the one the head marker certified", () => {
    const marker = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(REVIEW_FULL, "2026-09-20T00:30:00Z"),
        comment(marker, "2026-09-20T00:31:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
      allowUnconfirmedHead: true,
    });
    expect(selection.comment?.updated_at).toBe("2026-09-20T00:30:00Z");
    expect(selection.consideredReviews).toBe(2);
    // Only one body crosses the boundary — never a concatenation of both.
    expect(selection.comment?.body).toBe(REVIEW_FULL);
  });

  it("ignores reviews published after the marker for this head", () => {
    const marker = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(marker, "2026-09-20T00:11:00Z"),
        comment(REVIEW_INCREMENTAL, "2026-09-20T00:40:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
      allowUnconfirmedHead: true,
    });
    expect(selection.comment?.body).toBe(REVIEW_FULL);
  });

  it("refuses to select anything when no marker exists for the head", () => {
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(appendCertification("", { baseSha: BASE_A, headSha: BASE_B }), "2026-09-20T00:31:00Z"),
        comment(REVIEW_FULL, "2026-09-20T00:30:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
    });
    expect(selection.comment).toBeNull();
    expect(selection.reason).toContain("no recorded review marker for head");
  });

  it("never returns a non-bot comment", () => {
    const marker = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(marker, "2026-09-20T00:31:00Z", "someone-else"),
        comment(REVIEW_FULL, "2026-09-20T00:30:00Z", "someone-else"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
      allowUnconfirmedHead: true,
    });
    expect(selection.comment).toBeNull();
  });

  it("refuses to guess a head that is not the newest certification", () => {
    // HEAD_A is certified, but a later certification for HEAD_C exists. The boundary now belongs to
    // HEAD_C, so nothing ties a review to HEAD_A — and a guess would score a different head's review.
    const marker = appendCertification(
      appendCertification("", { baseSha: BASE_A, headSha: HEAD_A }),
      { baseSha: BASE_A, headSha: "d".repeat(40) },
    );
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(marker, "2026-09-20T00:31:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
    });
    expect(selection.comment).toBeNull();
    expect(selection.headConfirmed).toBe(false);
    expect(selection.headEvidence).toBe("unconfirmed");
    expect(selection.reason).toContain("not the newest certification");
  });

  it("trusts the boundary when the head is the newest certification", () => {
    // The last marker is the most recent certification, so no later certification can confuse it.
    // This is the live canary case: a standalone review that carries no head of its own.
    const marker = appendCertification(
      appendCertification("", { baseSha: BASE_A, headSha: "d".repeat(40) }),
      { baseSha: BASE_B, headSha: HEAD_A },
    );
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(standaloneReview("a real finding"), "2026-09-20T00:30:00Z"),
        comment(marker, "2026-09-20T00:31:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
    });
    expect(selection.comment?.updated_at).toBe("2026-09-20T00:30:00Z");
    expect(selection.headConfirmed).toBe(true);
    expect(selection.headEvidence).toBe("newest-certified-head");
  });

  it("recognises a standalone review as a review, not as a certification record", () => {
    const marker = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const review = standaloneReview(`quoted marker:\n<!-- mde-pr-agent-cert base=${BASE_A} head=${HEAD_A} -->`);
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(review, "2026-09-20T00:20:00Z"),
        comment(marker, "2026-09-20T00:21:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
    });
    expect(selection.comment?.body).toBe(review);
    expect(selection.marker?.body).toBe(marker);
  });

  it("only guesses an older head when the operator explicitly allows it", () => {
    const marker = appendCertification(
      appendCertification("", { baseSha: BASE_A, headSha: HEAD_A }),
      { baseSha: BASE_A, headSha: "d".repeat(40) },
    );
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(marker, "2026-09-20T00:31:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
      allowUnconfirmedHead: true,
    });
    expect(selection.comment?.body).toBe(REVIEW_FULL);
    expect(selection.headConfirmed).toBe(false);
    expect(selection.headEvidence).toBe("unconfirmed");
  });

  it("pins the exact head instead of the newest review under the marker", () => {
    // Regression for the real replay defect: the marker comment is edited in place, so its
    // timestamp is the LAST certification. For an older head the boundary alone returns the newer
    // head's review.
    const olderHead = HEAD_A;
    const newerHead = "d".repeat(40);
    const marker = appendCertification(
      appendCertification("", { baseSha: BASE_A, headSha: olderHead }),
      { baseSha: BASE_A, headSha: newerHead },
    );
    const olderReview = `${REVIEW_FULL}\n{"last_run":{"head_sha":"${olderHead}"}}`;
    const newerReview = `${REVIEW_INCREMENTAL}\n{"last_run":{"head_sha":"${newerHead}"}}`;
    const readHead = (body: string) => /"head_sha":"([0-9a-f]{40})"/.exec(body)?.[1] ?? null;

    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(olderReview, "2026-09-20T00:10:00Z"),
        comment(newerReview, "2026-09-20T00:20:00Z"),
        comment(marker, "2026-09-20T00:21:00Z"),
      ],
      headSha: olderHead,
      reviewMarkers: REVIEW_MARKERS,
      headShaOf: readHead,
    });
    expect(selection.headConfirmed).toBe(true);
    expect(selection.comment?.body).toBe(olderReview);
  });

  it("rejects a malformed head", () => {
    expect(() => hasCertificationForHead("x", "not-a-sha")).toThrow(/40-character git SHA/);
    expect(() =>
      selectCertifiedReviewForHead({ comments: [], headSha: "nope", reviewMarkers: REVIEW_MARKERS }),
    ).toThrow(/40-character git SHA/);
  });

  it("requires the whole marker shape, not a bare head= substring", () => {
    // A review comment can contain any of these because PR-Agent embeds the diff it reviews.
    expect(hasCertificationForHead(`the diff says head=${HEAD_A}`, HEAD_A)).toBe(false);
    expect(hasCertificationForHead(`base=${BASE_A} head=${HEAD_A}`, HEAD_A)).toBe(false);
    expect(hasCertificationForHead("<!-- mde-pr-agent-cert base=... head=... -->", HEAD_A)).toBe(false);
    expect(hasCertificationForHead(`<!-- mde-pr-agent-cert base=${BASE_A} head=${HEAD_A} -->`, HEAD_A)).toBe(true);
  });

  it("never treats a review that quotes a marker as the certification record", () => {
    const marker = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    // The quoted marker is inside a real review body, so it also carries a review token.
    const quoted = `## Incremental MDE PR Review\n<!-- pr-agent:review:incremental -->\n\n\`\`\`\n${marker}\n\`\`\``;
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(marker, "2026-09-20T00:11:00Z"),
        comment(quoted, "2026-09-20T00:20:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
      allowUnconfirmedHead: true,
    });
    // Without the review-token exclusion the newer quoting review becomes the marker and is then
    // selected as its own certified review — the wrong review, scored as if it were current.
    expect(selection.comment?.body).toBe(REVIEW_FULL);
    expect(selection.marker?.body).toBe(marker);
  });

  it("uses the newest marker when several name the same head", () => {
    const marker = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const selection = selectCertifiedReviewForHead({
      comments: [
        comment(REVIEW_FULL, "2026-09-20T00:10:00Z"),
        comment(marker, "2026-09-20T00:11:00Z"),
        comment(REVIEW_INCREMENTAL, "2026-09-20T00:30:00Z"),
        comment(marker, "2026-09-20T00:40:00Z"),
      ],
      headSha: HEAD_A,
      reviewMarkers: REVIEW_MARKERS,
      allowUnconfirmedHead: true,
    });
    expect(selection.marker?.updated_at).toBe("2026-09-20T00:40:00Z");
    expect(selection.comment?.body).toBe(REVIEW_INCREMENTAL);
  });
});

describe("PR-Agent review policy", () => {
  it("uses incremental review only when the current base was previously certified", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    expect(selectReviewCommand({ action: "synchronize", certificationBodies: [history], baseSha: BASE_A })).toBe("/review -i");
    expect(selectReviewCommand({ action: "synchronize", certificationBodies: [history], baseSha: BASE_B })).toBe("/review");
  });

  it("uses a full review when no prior certification exists", () => {
    expect(selectReviewCommand({ action: "synchronize", certificationBodies: [], baseSha: BASE_A })).toBe("/review");
  });

  it("accepts a fresh canonical review", () => {
    const result = verifyReviewResult({
      comments: [comment("<!-- pr-agent:review:incremental -->", "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a fresh standalone fallback review because it proves no head", () => {
    // SAN-1332 step 4. A standalone fallback is recognised only from prose shape and carries no
    // head of its own, so accepting it lets a review of commit A certify commit B. This test
    // previously asserted the opposite; that expectation was the defect.
    const body = "## Standalone PR Review\nPR-Agent could not safely update the persistent review\n## MDE PR Review";
    const result = verifyReviewResult({
      comments: [comment(body, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("STALE_HEAD");
    expect(result.reason).toContain("rerun /review");
  });

  it("still accepts a canonical fresh review alongside a standalone fallback", () => {
    const standalone = "## Standalone PR Review\nPR-Agent could not safely update the persistent review\n## MDE PR Review";
    const result = verifyReviewResult({
      comments: [
        comment(standalone, "2026-09-20T01:00:02Z"),
        comment("<!-- pr-agent:review:incremental -->", "2026-09-20T01:00:05Z"),
      ],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a fresh skipped incremental review only for a previously certified identical base", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = "Incremental Review Skipped\nNo files were changed since the previous PR Review";
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a skipped incremental review after the base changes", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = "Incremental Review Skipped\nNo files were changed since the previous PR Review";
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_B,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts the Markdown-linked incremental skip message for a certified base", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = "Incremental Review Skipped\nNo files were changed since the [previous PR Review](https://github.com/amoai-tech/mdeai/pull/84#issuecomment-1)";
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects the Markdown-linked incremental skip message after the base changes", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = "Incremental Review Skipped\nNo files were changed since the [previous PR Review](https://github.com/amoai-tech/mdeai/pull/84#issuecomment-1)";
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_B,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects stale, spoofed, or absent review output", () => {
    const stale = comment("<!-- pr-agent:review:incremental -->", "2026-09-20T00:59:59Z");
    const spoofed = comment("<!-- pr-agent:review:incremental -->", "2026-09-20T01:00:05Z", "someone-else");
    for (const comments of [[stale], [spoofed], []]) {
      expect(verifyReviewResult({ comments, startedAt: RUN_STARTED, reviewCommand: "/review -i", baseSha: BASE_A }).ok).toBe(false);
    }
  });

  it("keeps certification history for more than one base", () => {
    let history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    history = appendCertification(history, { baseSha: BASE_B, headSha: "d".repeat(40) });
    expect(hasCertificationForBase(history, BASE_A)).toBe(true);
    expect(hasCertificationForBase(history, BASE_B)).toBe(true);
  });
});
