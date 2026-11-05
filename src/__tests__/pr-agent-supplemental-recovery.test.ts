import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyReviewResult, verifySupplementalReview, reviewEnvelope } from "../../scripts/pr-agent/review-policy.mjs";

const BASE = "a".repeat(40), HEAD = "b".repeat(40);
const path = "src/components/events/event-ticket-tiers.tsx";
const diff = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-before\n+after\n`;
const body = `${reviewEnvelope({ baseSha: BASE, headSha: HEAD, command: "/review", type: "canonical" })}
<!-- pr-agent:review:full -->
## MDE PR Review

⚠️ **Review coverage:** The following files were not included in this review because of the token budget:
- \`${path}\`

<!-- pr-agent-review-state:v1
${JSON.stringify({ schema_version: 1, findings: [],
  last_run: { head_sha: HEAD, complete: false, excluded_files: [path], kind: "partial" } })}
-->`;
const original = { body, updated_at: "2026-11-05T09:00:05Z", user: { login: "github-actions[bot]" } };
const good = () => ({
  baseSha: BASE, headSha: HEAD, path, source: "exact-blob-diff", bounded: true,
  diff, diffSha256: createHash("sha256").update(diff).digest("hex"),
  output: { review: { key_issues_to_review: [], relevant_tests: "No" },
    coverage: { files_not_reviewed: [], files_partially_reviewed: [] },
    usage: { prompt_tokens: 1250, completion_tokens: 100, total_tokens: 1350 } },
});
const cert = (supplemental: unknown, comments = [original]) => verifyReviewResult({
  comments, startedAt: Date.parse("2026-11-05T09:00:00Z"), reviewCommand: "/review",
  baseSha: BASE, headSha: HEAD, supplemental,
});

describe("SAN-1640 bounded recovery of one omitted high-risk patch", () => {
  it("keeps the original strict incomplete review RED without real supplemental evidence", () => {
    expect(cert(null).code).toBe("INCOMPLETE_REVIEW");
    expect(cert(null).ok).toBe(false);
  });
  it("certifies only the same-head full patch actually reviewed by the pinned tool", () => {
    expect(verifySupplementalReview({ reviewBody: body.slice(body.indexOf("<!-- pr-agent:review:full -->")),
      baseSha: BASE, headSha: HEAD, supplemental: good() }).ok).toBe(true);
    const result = cert(good());
    expect(result).toMatchObject({ ok: true, code: "OK", coverageConfirmed: true,
      recoveredPath: path, type: "canonical+supplemental" });
  });
  it("rejects stale identity, substituted file, missing digest and model omission", () => {
    const mutations = [
      { headSha: "c".repeat(40) },
      { baseSha: "c".repeat(40) },
      { path: "src/payments/not-the-excluded-file.ts" },
      { diffSha256: "f".repeat(64) },
      { diff: diff + "+extra\n" },
      { source: "user-comment" },
      { bounded: false },
      { output: { review: { key_issues_to_review: [], relevant_tests: "No" },
        coverage: { files_not_reviewed: [path], files_partially_reviewed: [] } } },
      { output: { review: { key_issues_to_review: [], relevant_tests: false },
        coverage: { files_not_reviewed: [], files_partially_reviewed: [] } } },
    ];
    for (const mutation of mutations) {
      expect(cert({ ...good(), ...mutation }).ok).toBe(false);
      expect(cert({ ...good(), ...mutation }).code).toBe("INCOMPLETE_REVIEW");
    }
  });
  it("never certifies unlisted omitted files or failed model chunks", () => {
    const more = { ...original, body: original.body.replace(
      `- \`${path}\``, `- \`${path}\`\n... and 3 more`) };
    const failed = { ...original, body: original.body +
      "\n\n<hr>\n\nℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 3 chunks and the per-chunk results were merged. 1 chunk(s) failed and are not covered by this review.\n" };
    expect(cert(good(), [more]).ok).toBe(false);
    expect(cert(good(), [failed]).ok).toBe(false);
  });
  it("never trusts forged review comments or superseded reviews", () => {
    const fake = { ...original, user: { login: "attacker" } };
    expect(cert(good(), [fake]).ok).toBe(false);
    const replaced = { ...original, body: body.replaceAll(HEAD, "c".repeat(40)) };
    expect(cert(good(), [replaced]).ok).toBe(false);
  });
});
