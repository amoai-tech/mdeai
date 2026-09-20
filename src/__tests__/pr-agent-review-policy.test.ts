import { describe, expect, it } from "vitest";
import {
  appendCertification,
  hasCertificationForBase,
  selectReviewCommand,
  verifyReviewResult,
} from "../../scripts/pr-agent/review-policy.mjs";

const BASE_A = "a".repeat(40);
const BASE_B = "b".repeat(40);
const HEAD_A = "c".repeat(40);
const RUN_STARTED = Date.parse("2026-09-20T01:00:00Z");

function comment(body: string, updatedAt: string, login = "github-actions[bot]") {
  return { body, updated_at: updatedAt, user: { login } };
}

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
