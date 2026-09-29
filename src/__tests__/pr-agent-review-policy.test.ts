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
    });
    expect(selection.comment).toBeNull();
  });

  it("rejects a malformed head", () => {
    expect(() => hasCertificationForHead("x", "not-a-sha")).toThrow(/40-character git SHA/);
    expect(() =>
      selectCertifiedReviewForHead({ comments: [], headSha: "nope", reviewMarkers: REVIEW_MARKERS }),
    ).toThrow(/40-character git SHA/);
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

  it("accepts a fresh standalone fallback review", () => {
    const body = "## Standalone PR Review\nPR-Agent could not safely update the persistent review\n## MDE PR Review";
    const result = verifyReviewResult({
      comments: [comment(body, "2026-09-20T01:00:05Z")],
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
