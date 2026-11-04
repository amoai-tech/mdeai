import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendCertification,
  excludedCoverageFromReview,
  excludedFilesFromReview,
  hasCertificationForBase,
  parseReviewEnvelope,
  reviewEnvelope,
  selectReviewCommand,
  stampReviewEnvelope,
  verifyReviewResult,
} from "../../scripts/pr-agent/review-policy.mjs";
import {
  BASE_A,
  BASE_B,
  HEAD_A,
  HEAD_B,
  RUN_STARTED,
  REVIEW_FULL,
  comment,
  envelopedCanonical,
  envelopedStandalone,
} from "./pr-agent-review-fixtures";

describe("PR-Agent review policy", () => {
  it("always selects current full PR diff even after same-base certification", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    for (const action of ["opened", "reopened", "ready_for_review", "synchronize"]) {
      expect(selectReviewCommand({ action, certificationBodies: [history], baseSha: BASE_A })).toBe("/review");
      expect(selectReviewCommand({ action, certificationBodies: [history], baseSha: BASE_B })).toBe("/review");
    }
  });

  it("malformed, missing, or hostile history cannot enable historical incremental mode", () => {
    for (const bodies of [[], ["untrusted"], [null], [appendCertification("", { baseSha: BASE_A, headSha: HEAD_A })]]) {
      expect(selectReviewCommand({ action: "synchronize", certificationBodies: bodies, baseSha: BASE_A })).toBe("/review");
    }
  });

  it("regression: ordinary-titled two-parent merge adds history outside a six-file Chat PR diff", () => {
    const dir = mkdtempSync(join(tmpdir(), "mde-san1628-merge-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    const write = (path: string, content: string) => {
      mkdirSync(join(dir, path.substring(0, path.lastIndexOf("/"))), { recursive: true });
      writeFileSync(join(dir, path), content);
    };
    try {
      git("init", "-q", "-b", "main");
      git("config", "user.name", "MDE fixture");
      git("config", "user.email", "fixture@example.invalid");
      write("docs/root.md", "main");
      git("add", "."); git("commit", "-qm", "initial");
      git("switch", "-q", "-c", "chat-fix");
      for (let i = 0; i < 6; i++) write(`src/chat/file-${i}.tsx`, `// change ${i}`);
      git("add", "."); git("commit", "-qm", "fix: six chat files");
      git("switch", "-q", "main");
      write("src/rentals/unrelated.ts", "historical rentals change");
      write("src/events/unrelated.ts", "historical events change");
      git("add", "."); git("commit", "-qm", "feat: unrelated work on main");
      git("switch", "-q", "chat-fix");
      git("merge", "--no-ff", "-m", "chore: synchronize chat branch", "main");
      expect(git("rev-list", "--parents", "-n", "1", "HEAD").split(" ")).toHaveLength(3);
      const fullDiff = git("diff", "--name-only", "main...chat-fix").split("\n");
      expect(fullDiff).toHaveLength(6);
      expect(fullDiff.every((path) => path.startsWith("src/chat/"))).toBe(true);
      expect(git("diff", "--name-only", "HEAD^1", "HEAD")).toContain("src/rentals/unrelated.ts");
      expect(selectReviewCommand({ action: "synchronize", certificationBodies: [appendCertification("", { baseSha: BASE_A, headSha: HEAD_A })], baseSha: BASE_A })).toBe("/review");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("counts named and unlisted excluded files without inventing paths (PR #490)", () => {
    const footer = "\n⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n" +
      Array.from({ length: 50 }, (_, i) => `- \`src/unrelated-${i}.ts\`\n`).join("") + "... and 903 more\n";
    expect(excludedCoverageFromReview(footer)).toMatchObject({ unlistedCount: 903, total: 953 });
    expect(excludedFilesFromReview(footer)).toHaveLength(50);
    const result = verifyReviewResult({ comments: [comment(envelopedCanonical() + footer, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.code).toBe("INCOMPLETE_REVIEW");
    expect(result.reason).toContain("953 excluded");
    expect(result.reason).toContain("50 named, 903 unnamed");
  });

  it("rejects the actual PR #342 false-green: partial review excluded 17 of 20 changed files", () => {
    const body = envelopedCanonical().replace(
      /<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/,
      `<!-- pr-agent-review-state:v1
${JSON.stringify({ findings: [], schema_version: 1, last_run: { head_sha: HEAD_A, complete: false, excluded_files: Array.from({ length: 17 }, (_, i) => `src/file-${i}.ts`) } })}
-->`,
    );
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INCOMPLETE_REVIEW");
    expect(result.reason).toContain("excluded_files=17");
  });

  it("rejects a newer partial review instead of falling back to an older complete review from the same run", () => {
    const complete = envelopedCanonical();
    const partial = complete.replace('"complete":true', '"complete":false');
    const result = verifyReviewResult({
      comments: [
        comment(complete, "2026-09-20T01:00:05Z"),
        comment(partial, "2026-09-20T01:00:10Z"),
      ],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INCOMPLETE_REVIEW");
  });

  it("rejects excluded files even when an LLM incorrectly marks complete true", () => {
    const body = envelopedCanonical().replace('"excluded_files":[]', '"excluded_files":["src/unreviewed.ts"]');
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.code).toBe("INCOMPLETE_REVIEW");
  });

  it("rejects partial input coverage when no review state marker is published", () => {
    const noState = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const partial = "\n<hr>\n⚠️ **Review coverage:** The following files had patches clipped before analysis to fit the token budget (partial input coverage):\n" +
      "- `src/events/checkout.ts`\n... and 12 more\n";
    const result = verifyReviewResult({ comments: [comment(noState + partial, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.code).toBe("INCOMPLETE_REVIEW");
    expect(result.reason).toContain("partial input coverage");
  });

  it("rejects failed review chunks even when no files are explicitly excluded", () => {
    const noState = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const chunked = "\n<hr>\nℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 6 chunks and the per-chunk results were merged. 2 chunk(s) failed and are not covered by this review.\n";
    const result = verifyReviewResult({ comments: [comment(noState + chunked, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.code).toBe("INCOMPLETE_REVIEW");
    expect(result.reason).toContain("2 failed chunk(s)");
  });

  it.each([
    ["failed chunk", "ℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 3 chunks and the per-chunk results were merged. 1 chunk(s) failed and are not covered by this review."],
    ["partial input", "⚠️ **Review coverage:** The following files had patches clipped before analysis to fit the token budget (partial input coverage):\n- `src/venue-booking.ts`"],
    ["excluded file", "⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- `src/venue-booking.ts`"],
  ])("rejects provider-appended %s after model leaves a Markdown fence unclosed", (_kind, warning) => {
    for (const fence of ["```", "~~~", "````"]) {
      for (const withState of [true, false]) {
        const raw = withState ? envelopedCanonical() : envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
        const body = raw + `\n${fence}md\nThe AI reviewer forgot to close this example.\n\n<hr>\n\n${warning}\n`;
        const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")],
          startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
        expect(result, `${_kind} / ${fence} / state=${withState}`).toMatchObject({ ok: false, code: "INCOMPLETE_REVIEW" });
      }
    }
  });

  it.each([
    ["failed chunk", "ℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 3 chunks and the per-chunk results were merged. 1 chunk(s) failed and are not covered by this review."],
    ["partial input", "⚠️ **Review coverage:** The following files had patches clipped before analysis to fit the token budget (partial input coverage):\n- `src/example.ts`"],
    ["excluded file", "⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- `src/example.ts`"],
  ])("keeps ignoring a provider-shaped %s example inside a CLOSED model fence", (_kind, warning) => {
    const noState = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const body = noState + `\n\n\`\`\`md\n\n<hr>\n\n${warning}\n\`\`\`\n`;
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result, _kind).toMatchObject({ ok: true, coverageConfirmed: false });
  });

  it("ignores provider-shaped text in a closed fence even with an extra divider in that example", () => {
    const noState = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const example = "\n\n\`\`\`md\n\n<hr>\n\n" +
      "ℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 3 chunks and the per-chunk results were merged. 1 chunk(s) failed and are not covered by this review.\n\n" +
      "<hr>\n\nThe snippet is only an example.\n\`\`\`\n";
    const result = verifyReviewResult({ comments: [comment(noState + example, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result).toMatchObject({ ok: true, coverageConfirmed: false });
  });

  it("ignores examples of chunk/partial input warnings inside Markdown fences or quoted blocks", () => {
    const noState = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const example = "\n```md\nℹ️ **Chunked review:** reviewed in 6 chunks. 2 chunk(s) failed and are not covered by this review.\n" +
      "⚠️ **Review coverage:** The following files had patches clipped before analysis to fit the token budget (partial input coverage):\n- `src/example.ts`\n```\n";
    const result = verifyReviewResult({ comments: [comment(noState + example, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(true);
  });

  it("rejects a six-chunk review that explicitly excludes files even when the persistent state is absent", () => {
    const footer = [
      "",
      "<hr>",
      "ℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 6 chunks and the per-chunk results were merged.",
      "<hr>",
      "⚠️ **Review coverage:** The following files were not included in this review because of the token budget:",
      "- `docs/progress/_work/features-and-pages.md`",
      "- `docs/progress/_work/ai-architecture.md`",
      "- `docs/progress/_work/database-inventory.md`",
      "- `docs/progress/_work/release-and-runtime.md`",
      "- `docs/progress/data/pr-files.json`",
      "- `docs/progress-tracker.md`",
      "<hr>",
    ].join("\n");
    const noState = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const body = noState + footer;
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INCOMPLETE_REVIEW");
    expect(result.reason).toContain("6 excluded");
  });

  it.each(["```", "~~~", "````"])("ignores an excluded-file warning quoted inside a %s fenced block", (fence) => {
    const body = envelopedCanonical() + `\n${fence}md\n⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- \`src/example.ts\`\n${fence}\n`;
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(true);
  });

  it("ignores exclusions appearing only in a Markdown blockquote or indented code block", () => {
    const body = envelopedCanonical() + "\n> ⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n> - \`src/example.ts\`\n\n    ⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n    - \`src/indented.ts\`\n";
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(true);
  });

  it("still rejects a real footer after a code fence contains a fake footer", () => {
    const quoted = "\n```md\n⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- \`src/quoted.ts\`\n```\n";
    const real = "\n⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- \`src/real.ts\`\n";
    const result = verifyReviewResult({ comments: [comment(envelopedCanonical() + quoted + real, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.code).toBe("INCOMPLETE_REVIEW");
    expect(result.reason).toContain("1 excluded");
  });

  it("rejects explicit excluded-file footer even when a stale/incorrect state claims full coverage", () => {
    const body = envelopedCanonical() + "\n⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- `src/ignored.ts`\n";
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INCOMPLETE_REVIEW");
  });

  it("does not confuse a complete-coverage footer with an excluded-file failure", () => {
    const noState = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const body = noState + "\nℹ️ **Review coverage:** All changed files were reviewed.\n";
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("coverageConfirmed", false);
  });

  it("keeps state-free clean PR-Agent reviews working without claiming complete diff coverage", () => {
    const body = envelopedCanonical().replace(/<!-- pr-agent-review-state:v1\n[\s\S]*?\n-->/, "");
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("coverageConfirmed", false);
    expect(result.reason).toContain("full coverage unconfirmed");
  });

  it("rejects a persisted coverage record for a different PR head", () => {
    const body = envelopedCanonical().replace(`"head_sha":"${HEAD_A}"`, `"head_sha":"${HEAD_B}"`);
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.code).toBe("STALE_HEAD");
  });

  it("rejects duplicate persistent state markers", () => {
    const body = envelopedCanonical() + `\n<!-- pr-agent-review-state:v1
${JSON.stringify({ findings: [], schema_version: 1, last_run: { head_sha: HEAD_A, complete: true, excluded_files: [] } })}
-->`;
    const result = verifyReviewResult({ comments: [comment(body, "2026-09-20T01:00:05Z")], startedAt: RUN_STARTED, reviewCommand: "/review", baseSha: BASE_A, headSha: HEAD_A });
    expect(result.code).toBe("INVALID_REVIEW_STATE");
  });

  it("accepts a fresh canonical review", () => {
    const result = verifyReviewResult({
      comments: [comment(envelopedCanonical({ command: "/review -i" }), "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
      headSha: HEAD_A,
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
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ENVELOPE");
  });

  it("still accepts a canonical fresh review alongside a standalone fallback", () => {
    const standalone = "## Standalone PR Review\nPR-Agent could not safely update the persistent review\n## MDE PR Review";
    const result = verifyReviewResult({
      comments: [
        comment(standalone, "2026-09-20T01:00:02Z"),
        comment(envelopedCanonical({ command: "/review -i" }), "2026-09-20T01:00:05Z"),
      ],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a fresh skipped incremental review only for a previously certified identical base", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = `${reviewEnvelope({ baseSha: BASE_A, headSha: HEAD_A, command: "/review -i", type: "canonical" })}\nIncremental Review Skipped\nNo files were changed since the previous PR Review`;
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a skipped incremental review after the base changes", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = `${reviewEnvelope({ baseSha: BASE_A, headSha: HEAD_A, command: "/review -i", type: "canonical" })}\nIncremental Review Skipped\nNo files were changed since the previous PR Review`;
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_B,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts the Markdown-linked incremental skip message for a certified base", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = `${reviewEnvelope({ baseSha: BASE_A, headSha: HEAD_A, command: "/review -i", type: "canonical" })}\nIncremental Review Skipped\nNo files were changed since the [previous PR Review](https://github.com/amoai-tech/mdeai/pull/84#issuecomment-1)`;
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects the Markdown-linked incremental skip message after the base changes", () => {
    const history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    const skip = `${reviewEnvelope({ baseSha: BASE_A, headSha: HEAD_A, command: "/review -i", type: "canonical" })}\nIncremental Review Skipped\nNo files were changed since the [previous PR Review](https://github.com/amoai-tech/mdeai/pull/84#issuecomment-1)`;
    const result = verifyReviewResult({
      comments: [comment(history, "2026-09-20T00:50:00Z"), comment(skip, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review -i",
      baseSha: BASE_B,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects stale, spoofed, or absent review output", () => {
    const stale = comment("<!-- pr-agent:review:incremental -->", "2026-09-20T00:59:59Z");
    const spoofed = comment("<!-- pr-agent:review:incremental -->", "2026-09-20T01:00:05Z", "someone-else");
    for (const comments of [[stale], [spoofed], []]) {
      expect(verifyReviewResult({ comments, startedAt: RUN_STARTED, reviewCommand: "/review -i", baseSha: BASE_A, headSha: HEAD_A }).ok).toBe(false);
    }
  });

  it("accepts a canonical review only when its envelope matches the exact current head", () => {
    const result = verifyReviewResult({
      comments: [comment(envelopedCanonical(), "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("OK");
    expect(result).toHaveProperty("coverageConfirmed", true);
  });

  it("accepts an exact-head standalone fallback with a trusted envelope", () => {
    const result = verifyReviewResult({
      comments: [comment(envelopedStandalone(), "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("OK");
  });

  it("rejects a review envelope for an older head immediately", () => {
    const result = verifyReviewResult({
      comments: [comment(envelopedCanonical({ headSha: HEAD_A }), "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_B,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("STALE_HEAD");
  });

  it("rejects a review envelope for the wrong base", () => {
    const result = verifyReviewResult({
      comments: [comment(envelopedCanonical({ baseSha: BASE_B }), "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("WRONG_BASE");
  });

  it("rejects a review envelope for the wrong review command", () => {
    const result = verifyReviewResult({
      comments: [comment(envelopedCanonical({ command: "/review -i" }), "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("WRONG_COMMAND");
  });

  it("rejects canonical output with no review envelope", () => {
    const result = verifyReviewResult({
      comments: [comment(REVIEW_FULL, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects duplicate review envelopes", () => {
    const body = `${reviewEnvelope({ baseSha: BASE_A, headSha: HEAD_A, command: "/review", type: "canonical" })}\n${envelopedCanonical()}`;
    const result = verifyReviewResult({
      comments: [comment(body, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects a malformed review envelope instead of treating it as absent", () => {
    const malformed = `<!-- mde-agent-review:v1 base=${BASE_A} head=not-a-sha command="/review" type=canonical -->\n${REVIEW_FULL}`;
    const result = verifyReviewResult({
      comments: [comment(malformed, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ENVELOPE");
  });

  it("returns MISSING_HEAD when the trusted envelope omits head identity", () => {
    const malformed = `<!-- mde-agent-review:v1 base=${BASE_A} command="/review" type=canonical -->\n${REVIEW_FULL}`;
    const result = verifyReviewResult({
      comments: [comment(malformed, "2026-09-20T01:00:05Z")],
      startedAt: RUN_STARTED,
      reviewCommand: "/review",
      baseSha: BASE_A,
      headSha: HEAD_A,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MISSING_HEAD");
  });

  it("ignores marker-shaped text later in the review body as non-authoritative", () => {
    const quoted = `${reviewEnvelope({ baseSha: BASE_A, headSha: HEAD_A, command: "/review", type: "canonical" })}\n${REVIEW_FULL}\nquoted: <!-- mde-agent-review:v1 base=${BASE_B} head=${HEAD_B} command="/review" type=standalone -->`;
    const parsed = parseReviewEnvelope(quoted);
    expect(parsed.valid).toBe(true);
    expect(parsed.headSha).toBe(HEAD_A);
  });

  it("re-stamps an existing leading envelope without duplicating it", () => {
    const original = envelopedCanonical({ headSha: HEAD_A });
    const stamped = stampReviewEnvelope(original, {
      baseSha: BASE_A,
      headSha: HEAD_B,
      command: "/review",
      type: "canonical",
    });
    expect(stamped.match(/<!-- mde-agent-review:/g)).toHaveLength(1);
    expect(parseReviewEnvelope(stamped).headSha).toBe(HEAD_B);
  });

  it("keeps certification history for more than one base", () => {
    let history = appendCertification("", { baseSha: BASE_A, headSha: HEAD_A });
    history = appendCertification(history, { baseSha: BASE_B, headSha: "d".repeat(40) });
    expect(hasCertificationForBase(history, BASE_A)).toBe(true);
    expect(hasCertificationForBase(history, BASE_B)).toBe(true);
  });
});

describe("SAN-1609 canonical footer Markdown boundaries", () => {
  const footer = (spaces = "") => `${spaces}⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- \`src/a.ts\`\n`;
  it.each(["", " ", "  ", "   "])("finds a real footer with %s indentation", (spaces) => {
    expect(excludedFilesFromReview(footer(spaces))).toEqual(["src/a.ts"]);
  });
  it("ignores a lazy blockquote continuation, not just explicit > prefixes", () => {
    expect(excludedFilesFromReview(`> quoted context\n${footer()}`)).toEqual([]);
    expect(excludedFilesFromReview(`> quoted context\n\n${footer()}`)).toEqual(["src/a.ts"]);
  });
});
