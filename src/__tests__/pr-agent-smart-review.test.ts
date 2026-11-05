import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { reviewEnvelope, excludedFilesFromReview, clippedPatchesFromReview } from "../../scripts/pr-agent/review-policy.mjs";
import {
  buildCoverageReport, classifyFiles, planFollowupBatches,
  reviewCoverageFromComment, hasPublishedPartialReview, parseReviewUsage, validateGeneratedJson, validateSnapshotReferences, COVERAGE_MARKER,
} from "../../scripts/pr-agent/smart-review.mjs";

const BASE = "a".repeat(40), HEAD = "b".repeat(40);
const marker = reviewEnvelope({ baseSha: BASE, headSha: HEAD, command: "/review", type: "canonical" });
const complete = `${marker}\n<!-- pr-agent:review:full -->\n<!-- pr-agent-review-state:v1\n${JSON.stringify({ schema_version: 1, findings: [], last_run: { head_sha: HEAD, complete: true, excluded_files: [] } })}\n-->`;
const omitted = `${marker}\n<!-- pr-agent:review:full -->\n⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- \`src/payments/checkout.ts\`\n`;
const files = [
  { filename: "src/payments/checkout.ts", status: "modified", patch: "+pay" },
  { filename: "src/components/Card.tsx", status: "modified", patch: "+ui" },
  { filename: "docs/progress/data/pr-files.json", status: "modified", patch: "+json" },
  { filename: "docs/overview.md", status: "modified", patch: "+docs" },
  { filename: "package-lock.json", status: "modified" },
];

describe("SAN-1634 giant patch coverage (real PR #605 regression)", () => {
  const clipped = "docs/UIUX/01-progress.md";
  const warning = "⚠️ **Review coverage:** The following files had patches clipped before analysis to fit the token budget (partial input coverage):\n- \`" + clipped + "\`\n";
  const authoritativeFooter = "\n\n<hr>\n\n" + warning;
  const giant = { filename: clipped, status: "modified", patch: "+".concat("x".repeat(42000)) };
  const code = { filename: "src/payments/checkout.ts", status: "modified", patch: "+fixed" };

  it("extracts only true top-level clipped patches, even after an unfinished model fence", () => {
    expect(clippedPatchesFromReview(authoritativeFooter).files).toEqual([clipped]);
    expect(clippedPatchesFromReview(authoritativeFooter + "... and 4 more\n")).toMatchObject({
      present: true, files: [clipped], unlistedCount: 4, total: 5,
    });
    expect(clippedPatchesFromReview("\n\`\`\`markdown\n" + authoritativeFooter).files).toEqual([clipped]);
    expect(clippedPatchesFromReview("\n> " + warning.replaceAll("\n", "\n> ")).files).toEqual([]);
    expect(clippedPatchesFromReview("\n\`\`\`md\n" + authoritativeFooter + "\n\`\`\`\n").files).toEqual([]);
  });

  it("never certifies 100% when the provider clipped a giant file despite complete=true", () => {
    const body = complete + authoritativeFooter;
    const parsed = reviewCoverageFromComment(body, BASE, HEAD);
    expect(parsed.status).toBe("partial");
    expect(parsed.clipped).toEqual([clipped]);
    const report = buildCoverageReport({repo:"amoai-tech/mdeai",number:605,baseSha:BASE,headSha:HEAD,
      files:[giant,code],expectedCount:2,reviewBody:body});
    expect(report.status).toBe("PARTIAL");
    expect(report.counts.partiallyReviewed).toBe(1);
    expect(parsed.reviewedRemainder).toBe(true);
    expect(report.counts.aiReviewed).toBe(1);
    expect(report.details.find((f:{path:string})=>f.path===code.filename)?.coverage).toBe("ai-reviewed");
    expect(report.criticalPending).toHaveLength(0);
    expect(report.details.find((f:{path:string})=>f.path===clipped)?.coverage).toBe("partially-reviewed");
    expect(report.quality.percentVerified).toBeLessThan(100);
    expect(report.body).toContain("Partially reviewed: 1");
    expect(report.plan.deferred).toEqual(expect.arrayContaining([
      expect.objectContaining({path:clipped,reason:expect.stringContaining("oversized")}),
    ]));
    expect(report.body).toContain("line-bounded");
  });

  it("keeps unaffected files UNKNOWN when some clipped filenames were not listed", () => {
    const body = complete + authoritativeFooter + "... and 4 more\n";
    const parsed = reviewCoverageFromComment(body, BASE, HEAD);
    expect(parsed.status).toBe("partial");
    expect(parsed.reviewedRemainder).toBe(false);
    const report = buildCoverageReport({repo:"a/b",number:605,baseSha:BASE,headSha:HEAD,
      files:[giant,code],expectedCount:2,reviewBody:body});
    expect(report.counts.aiReviewed).toBe(0);
    expect(report.details.find((f:{path:string})=>f.path===code.filename)?.coverage).toBe("unknown");
  });

  it("keeps unaffected files UNKNOWN when a clipped review also has failed chunks", () => {
    const failedChunkFooter = "\n\n<hr>\n\n" +
      "ℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 3 chunks and the per-chunk results were merged. 1 chunk(s) failed and are not covered by this review.\n";
    const body = complete + failedChunkFooter + authoritativeFooter;
    expect(reviewCoverageFromComment(body, BASE, HEAD).reviewedRemainder).toBe(false);
    const report = buildCoverageReport({repo:"a/b",number:605,baseSha:BASE,headSha:HEAD,
      files:[giant,code],expectedCount:2,reviewBody:body});
    expect(report.counts.aiReviewed).toBe(0);
    expect(report.status).toBe("PARTIAL");
    expect(report.details.find((f:{path:string})=>f.path===code.filename)?.coverage).toBe("unknown");
  });

  it("rejects malformed persisted review states that the canonical strict verifier rejects", () => {
    const last_run = { head_sha: HEAD, complete: true, excluded_files: [] };
    const invalid = [
      { last_run }, // no schema version and findings
      { schema_version: 2, findings: [], last_run },
      { schema_version: 1, findings: "not-an-array", last_run },
    ];
    for (const state of invalid) {
      const body = marker + "\n<!-- pr-agent:review:full -->\n<!-- pr-agent-review-state:v1\n" +
        JSON.stringify(state) + "\n-->";
      expect(reviewCoverageFromComment(body, BASE, HEAD).status).toBe("failed");
      const report = buildCoverageReport({ repo: "a/b", number: 730, baseSha: BASE, headSha: HEAD,
        files: [{ filename: "src/payments/checkout.ts", patch: "+x" }], expectedCount: 1, reviewBody: body });
      expect(report.status).toBe("FAILED");
      expect(report.counts.aiReviewed).toBe(0);
      expect(report.quality.percentVerified).toBeLessThan(100);
    }
  });

  it("keeps a stale persisted head UNKNOWN rather than falsely calling the review job FAILED", () => {
    const state = { schema_version: 1, findings: [], last_run: {
      head_sha: "c".repeat(40), complete: true, excluded_files: [],
    } };
    const body = marker + "\n<!-- pr-agent:review:full -->\n<!-- pr-agent-review-state:v1\n" +
      JSON.stringify(state) + "\n-->";
    const result = reviewCoverageFromComment(body, BASE, HEAD);
    expect(result.status).toBe("unknown");
    const report = buildCoverageReport({ repo: "a/b", number: 730, baseSha: BASE, headSha: HEAD,
      files: [{ filename: "src/payments/checkout.ts", patch: "+x" }], expectedCount: 1, reviewBody: body });
    expect(report.status).toBe("UNKNOWN");
    expect(report.counts.aiReviewed).toBe(0);
  });

  it("explains an incomplete persisted state without inventing a failed AI chunk", () => {
    const state = { schema_version: 1, findings: [], last_run: {
      head_sha: HEAD, complete: false, excluded_files: [],
    } };
    const body = marker + "\n<!-- pr-agent:review:full -->\n<!-- pr-agent-review-state:v1\n" +
      JSON.stringify(state) + "\n-->";
    const result = reviewCoverageFromComment(body, BASE, HEAD);
    expect(result.status).toBe("partial");
    expect(result.reason).toContain("complete=false");
    expect(result.reason).not.toContain("failed chunk");
  });

  it("calls a zero follow-up budget bounded, not an oversized source file", () => {
    const report = buildCoverageReport({ repo: "a/b", number: 730, baseSha: BASE, headSha: HEAD,
      files: [{ filename: "src/payments/checkout.ts", patch: "+x" }], expectedCount: 1 });
    const plan = planFollowupBatches(report, { baseSha: BASE, headSha: HEAD, maxPatchBytes: 0 });
    expect(plan.batches).toHaveLength(0);
    expect(plan.deferred).toEqual([{
      path: "src/payments/checkout.ts", reason: "bounded patch/call budget",
    }]);
  });

  it("does not mark successful chunks as a 100% review when a chunk failed", () => {
    const failedChunkFooter = "\n\n<hr>\n\n" +
      "ℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 3 chunks and the per-chunk results were merged. 1 chunk(s) failed and are not covered by this review.\n";
    const body = complete + failedChunkFooter;
    expect(reviewCoverageFromComment(body, BASE, HEAD).status).toBe("partial");
    const report = buildCoverageReport({repo:"a/b",number:605,baseSha:BASE,headSha:HEAD,
      files:[{filename:"src/payments/checkout.ts",patch:"+x"}],expectedCount:1,reviewBody:body});
    expect(report.status).toBe("PARTIAL");
    expect(report.counts.aiReviewed).toBe(0);
    expect(report.quality.percentVerified).toBeLessThan(100);
    expect(report.body).toContain("failed chunk");
  });

  it("does not treat prior names on renamed giant files as fully reviewed", () => {
    const old = "src/payments/legacy-checkout.ts";
    const renamed = {filename:"src/payments/checkout.ts",previous_filename:old,status:"renamed",patch:"+x"};
    const body = complete + "\n\n<hr>\n\n" + warning.replace(clipped, old);
    const report = buildCoverageReport({repo:"a/b",number:690,baseSha:BASE,headSha:HEAD,
      files:[renamed],expectedCount:1,reviewBody:body});
    expect(report.details[0].coverage).toBe("partially-reviewed");
    expect(report.status).toBe("PARTIAL");
    expect(report.criticalPending).toHaveLength(1);
  });
});

describe("SAN-1609 smart coverage", () => {
  it("prioritizes security and app code, with exact patch digests and no default-low unknowns", () => {
    const inv = classifyFiles([...files, { filename: "random.format" }, { filename: "supabase/migrations/x.sql" }], 7);
    expect(inv.files.map((f: { category: string }) => f.category)).toEqual(["critical", "critical", "high", "low", "generated", "excluded", "unknown"]);
    expect(inv.files[0].patchDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(classifyFiles(files, 12).unknownInventory).toBe(true);
    expect(classifyFiles(Array.from({ length: 3000 }, (_, i) => ({ filename: `doc${i}.md` })), 3000).unknownInventory).toBe(true);
  });

  it("validates known MDE JSON snapshots, duplicates and relationships without claiming full schema proof", () => {
    const prFiles = "docs/progress/data/pr-files.json";
    const good = { prs: { "485": { files: ["a.md", "b.md"], additions: 2, deletions: 0 } } };
    expect(validateGeneratedJson(prFiles, JSON.stringify(good)).status).toBe("validated");
    expect(validateGeneratedJson(prFiles, JSON.stringify({ prs: { "485": { ...good.prs[485], files: ["a.md", "a.md"] } } })).status).toBe("failed");
    expect(validateGeneratedJson(prFiles, "{bad").status).toBe("failed");
    expect(validateGeneratedJson("docs/progress/data/pr-data.json", JSON.stringify({ repo: "amoai-tech/mdeai", totals: { open_prs: 2 }, prs: [{ number: 1 }, { number: 1 }] })).status).toBe("failed");
    expect(validateGeneratedJson("docs/progress/data/linear-data.json", JSON.stringify({ project: { id: "x" }, issue_count: 1, issues: [{ identifier: "SAN-2" }] })).status).toBe("validated");
    const prData = JSON.stringify({ prs: [{ number: 485 }] });
    expect(validateSnapshotReferences(prData, JSON.stringify(good)).status).toBe("validated");
    expect(validateSnapshotReferences(prData, JSON.stringify({ prs: { "123": good.prs[485] } })).status).toBe("failed");
    expect(validateSnapshotReferences(prData, undefined).status).toBe("unknown");
  });

  it("ignores fenced/quoted warnings but reads true top-level exclusions", () => {
    const warning = "⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- `src/a.ts`\n";
    expect(excludedFilesFromReview(`\n\`\`\`md\n${warning}\`\`\`\n`)).toEqual([]);
    expect(excludedFilesFromReview(`\n> ${warning.replace(/\n/g, "\n> ")}`)).toEqual([]);
    expect(excludedFilesFromReview(`\n\`\`\`md\n${warning}\`\`\`\n${warning}`)).toEqual(["src/a.ts"]);
    expect(reviewCoverageFromComment(complete + "\n```md\n" + warning + "```\n", BASE, HEAD).status).toBe("complete");
  });

  it("reports COMPLETE only for proven same-head AI coverage, and keeps deterministic separate", () => {
    const report = buildCoverageReport({ repo: "amoai-tech/mdeai", number: 641, baseSha: BASE, headSha: HEAD, files, expectedCount: 5, reviewBody: complete,
      validations: { "docs/progress/data/pr-files.json": { status: "validated" } } });
    expect(report.status).toBe("COMPLETE");
    expect(report.counts.aiReviewed).toBe(3);
    expect(report.counts.deterministicValidated).toBe(1);
    expect(report.counts.policyExcluded).toBe(2);
    expect(report.body).toContain(COVERAGE_MARKER);
    expect(buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: "c".repeat(40), files, expectedCount: 5, reviewBody: complete }).status).toBe("UNKNOWN");
  });

  it("preserves published exact-head partial evidence when the reusable verifier fails", () => {
    const excludedState = `${marker}\n<!-- pr-agent:review:full -->\n<!-- pr-agent-review-state:v1\n${JSON.stringify({
      schema_version: 1, findings: [],
      last_run: { head_sha: HEAD, complete: false, excluded_files: ["src/payments/checkout.ts"] },
    })}\n-->`;
    const report = buildCoverageReport({ repo: "amoai-tech/mdeai", number: 756,
      baseSha: BASE, headSha: HEAD,
      files: [
        { filename: "src/payments/checkout.ts", patch: "+checkout" },
        { filename: "src/components/Event.tsx", patch: "+component" },
      ], expectedCount: 2, reviewBody: excludedState, reviewJobResult: "success" });
    expect(report.status).toBe("PARTIAL");
    expect(report.counts.uncovered).toBe(1);
    expect(report.counts.failed).toBe(0);
    expect(report.counts.unknown).toBe(1);
    expect(report.details.find((f: { path: string }) => f.path === "src/payments/checkout.ts")?.coverage).toBe("unreviewed");
    expect(report.body).toContain("**Follow-up:** 2 file(s) lack proven AI coverage");
    // Actual reviewer failure with no trusted review evidence must still fail.
    const noReview = buildCoverageReport({ repo: "amoai-tech/mdeai", number: 756,
      baseSha: BASE, headSha: HEAD, files: [{ filename: "src/payments/checkout.ts", patch: "+x" }],
      expectedCount: 1, reviewJobResult: "failure" });
    expect(noReview.status).toBe("FAILED");
  });

  it("only accepts a typed exact-head partial state as advisory evidence after a failed job", () => {
    const partial = `${marker}\n<!-- pr-agent:review:full -->\n<!-- pr-agent-review-state:v1\n${JSON.stringify({
      schema_version: 1, findings: [], last_run: {
        head_sha: HEAD, complete: false, excluded_files: ["src/payments/checkout.ts"],
      },
    })}\n-->`;
    const accepts = (body: string, status = "failure") => hasPublishedPartialReview({
      body, baseSha: BASE, headSha: HEAD, reviewJobResult: status,
    });
    expect(accepts(partial)).toBe(true);
    expect(accepts(partial, "success")).toBe(false);
    expect(accepts(partial.replace(HEAD, "c".repeat(40)))).toBe(false);
    expect(accepts(partial.replace('"complete":false', '"complete":true'))).toBe(false);
    expect(accepts(partial.replace('"excluded_files":["src/payments/checkout.ts"]', '"excluded_files":[]'))).toBe(false);
    expect(accepts(partial.replace('"schema_version":1', '"schema_version":2'))).toBe(false);
    expect(accepts(partial.replace('"findings":[]', '"findings":"bad"'))).toBe(false);
    expect(accepts(partial.replace('<!-- pr-agent-review-state:v1', '<!-- old-state'))).toBe(false);
    expect(accepts(partial.replace('<!-- pr-agent:review:full -->', 'other'))).toBe(false);
  });

  it("reports partial missing high-risk files, unknown state and provider failure honestly", () => {
    const report = buildCoverageReport({ repo: "amoai-tech/mdeai", number: 485, baseSha: BASE, headSha: HEAD, files, expectedCount: 5, reviewBody: omitted,
      validations: { "docs/progress/data/pr-files.json": { status: "validated" } } });
    expect(report.status).toBe("PARTIAL");
    expect(report.counts.uncovered).toBe(1);
    expect(report.counts.aiReviewed).toBe(0);
    expect(report.criticalPending.map((f: { path: string }) => f.path)).toContain("src/payments/checkout.ts");
    expect(buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD, files, expectedCount: 5, reviewBody: `${marker}\n<!-- pr-agent:review:full -->` }).status).toBe("UNKNOWN");
    expect(buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD, files, expectedCount: 5, reviewJobResult: "failure" }).status).toBe("FAILED");
  });

  it("plans only bounded, digest-bound followups, with no repeat for same completed batch", () => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD, files, expectedCount: 5, reviewBody: omitted });
    const options = { baseSha: BASE, headSha: HEAD, modelConfigDigest: "model-v046" };
    const planned = planFollowupBatches(report, options);
    expect(planned.batches.length).toBeGreaterThan(0);
    const done = [{ ...planned.batches[0], complete: true }];
    expect(planFollowupBatches(report, { ...options, completed: done }).batches).toHaveLength(planned.batches.length - 1);
    expect(planFollowupBatches(report, { ...options, modelConfigDigest: "new-model", completed: done }).batches).toHaveLength(planned.batches.length);
    expect(planFollowupBatches(report, { ...options, headSha: "c".repeat(40), completed: done }).batches).toHaveLength(planned.batches.length);
    expect(planFollowupBatches(report, { ...options, maxBatches: 0 }).batches).toHaveLength(0);
    const missing = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD, files: [{ filename: "src/payments/checkout.ts" }], expectedCount: 1 });
    expect(planFollowupBatches(missing, options).deferred[0].reason).toContain("missing exact patch");
  });

  it("leaves required Floor, permissions and pinned shared workflow unchanged", () => {
    const source = readFileSync(".github/workflows/pr-agent.yml", "utf8");
    const parsed = parseDocument(source);
    expect(parsed.errors).toEqual([]);
    const jobs = parsed.toJS() as { jobs: Record<string, { needs: string; name: string; permissions: Record<string, string>; steps: Array<{ with: Record<string, unknown> }> }> };
    const job = jobs.jobs["smart-coverage"];
    expect(job.name).toContain("advisory");
    expect(job.needs).toBe("review");
    expect(job.permissions).toEqual({ actions: "read", contents: "read", "pull-requests": "write", issues: "write" });
    expect(job.steps[0].with.ref).toBe("${{ github.event.pull_request.base.sha }}");
    expect(source).toMatch(/^    uses: amoai-tech\/pr-review-infra\/\.github\/workflows\/pr-agent\.yml@[0-9a-f]{40}$/m);
    expect(source).toContain('const canonicalReview = matching.find((comment) => {');
    expect(source).toContain('reviewBody: process.env.REVIEW_JOB_RESULT === "success"');
    expect(source).toContain("isStandaloneReview(envelope.body)");
    expect(source).toContain("canonicalReview ?? standaloneReview");
    expect(source).toContain('reviewJobResult: publishPartial ? "success" : process.env.REVIEW_JOB_RESULT');
    expect(source).toContain('hasPublishedPartialReview({');
    expect(source).toContain('**Reusable reviewer check:**');
  });
});

describe("SAN-1609 Canary boundary regressions", () => {
  const base = "a".repeat(40), head = "b".repeat(40);
  const anchor = reviewEnvelope({ baseSha: base, headSha: head, command: "/review", type: "canonical" });
  const footer = (name: string) => `${anchor}\n<!-- pr-agent:review:full -->\n⚠️ **Review coverage:** The following files were not included in this review because of the token budget:\n- \`${name}\`\n`;
  const single = (filename: string, opts: Record<string, unknown> = {}) =>
    buildCoverageReport({ repo: "amoai-tech/mdeai", number: 641, baseSha: base, headSha: head,
      files: [{ filename, patch: "+x", ...opts }], expectedCount: 1, reviewBody: footer(filename) });

  it("keeps narrative security docs low, but still prioritizes migrations and workflow config", () => {
    expect(classifyFiles([{ filename: "docs/security.md" }], 1).files[0].category).toBe("low");
    expect(single("docs/security.md").criticalPending).toHaveLength(0);
    expect(classifyFiles([{ filename: ".github/workflows/security.yml" }, { filename: "supabase/migrations/2026.sql" }], 2).files.map((f: { category: string }) => f.category)).toEqual(["critical", "critical"]);
  });

  it("always applies policy exclusions before critical keywords", () => {
    const file = { filename: "graphify-out/security/report.js", patch: "+x" };
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: base, headSha: head,
      files: [file], expectedCount: 1, reviewBody: complete });
    expect(report.details[0].category).toBe("excluded");
    expect(report.details[0].coverage).toBe("policy-excluded");
    expect(report.counts.aiReviewed).toBe(0);
    expect(report.counts.policyExcluded).toBe(1);
  });

  it("preserves unusual exact filenames, including newlines and backticks, without renaming them", () => {
    const actual = "a\nb`c.ts";
    const report = single(actual);
    expect(report.details[0].path).toBe(actual);
    expect(report.details[0].patchDigest).toMatch(/^[a-f0-9]{64}$/);
    const plan = planFollowupBatches(report, { baseSha: base, headSha: head });
    expect(plan.batches[0].paths).toEqual([actual]);
    expect(report.body).toContain("a\\nb`c.ts");
    expect(report.body).not.toContain("a_b_c.ts");
  });

  it("uses locale-independent code-point order for equal-priority files", () => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: base, headSha: head,
      files: [{ filename: "src/ä.ts", patch: "+x" }, { filename: "src/z.ts", patch: "+x" }], expectedCount: 2 });
    expect(report.details.map((f: { path: string }) => f.path)).toEqual(["src/z.ts", "src/ä.ts"]);
    expect(planFollowupBatches(report, { baseSha: base, headSha: head, maxBatches: 1 }).batches[0].paths).toEqual(["src/z.ts", "src/ä.ts"]);
  });

  it.each(["./src/a.ts", "src/a.ts "])("normalizes equivalent omitted paths %s", (alias) => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: base, headSha: head,
      files: [{ filename: "src/a.ts", patch: "+x" }], expectedCount: 1, reviewBody: footer(alias) });
    expect(report.counts.uncovered).toBe(1);
    expect(report.details[0].coverage).toBe("unreviewed");
  });

  it("matches an omitted previous filename on a GitHub rename", () => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: base, headSha: head,
      files: [{ filename: "src/new.ts", previous_filename: "src/old.ts", status: "renamed", patch: "+x" }],
      expectedCount: 1, reviewBody: footer("src/old.ts") });
    expect(report.counts.uncovered).toBe(1);
    expect(report.details[0].path).toBe("src/new.ts");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5, "2"])("does not bypass the batch count bound %s", (maxBatches) => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: base, headSha: head,
      files: [{ filename: "src/a.ts", patch: "+x" }], expectedCount: 1 });
    expect(planFollowupBatches(report, { baseSha: base, headSha: head, maxBatches: maxBatches as number }).batches).toHaveLength(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5, "40000"])("does not bypass patch byte budget %s", (maxPatchBytes) => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: base, headSha: head,
      files: [{ filename: "src/oversized.ts", patch: "+x".repeat(18000) }], expectedCount: 1 });
    const plan = planFollowupBatches(report, { baseSha: base, headSha: head, maxPatchBytes: maxPatchBytes as number });
    expect(plan.batches).toHaveLength(0);
    expect(plan.deferred).toHaveLength(1);
  });

  it("cannot silently treat an unavailable generated companion as validated", () => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: base, headSha: head,
      files: [{ filename: "docs/progress/data/pr-data.json", patch: "+x" }], expectedCount: 1,
      reviewBody: complete, validations: { "docs/progress/data/pr-data.json": { status: "unknown", reason: "cross-file source unavailable" } } });
    expect(report.status).toBe("UNKNOWN");
    const yaml = parseDocument(readFileSync(".github/workflows/pr-agent.yml", "utf8"));
    expect(yaml.errors).toEqual([]);
    const job = (yaml.toJS() as { jobs: Record<string, { steps: Array<{with?: {script?: string}}> }> }).jobs["smart-coverage"];
    expect(job.steps[1].with?.script).toContain('if (relationship.status === "unknown")');
    expect(job.steps[1].with?.script).toContain("validations[file.filename] = relationship");
  });
});

describe("SAN-1609 post-merge coverage smoke", () => {
  it("requires UNKNOWN when a changed patch is missing despite claimed complete AI review", () => {
    const report = buildCoverageReport({
      repo: "amoai-tech/mdeai", number: 641, baseSha: BASE, headSha: HEAD,
      files: [{ filename: "src/mastra/agents/event-agent.ts", status: "modified" }],
      expectedCount: 1, reviewBody: complete,
    });
    expect(report.counts.aiReviewed).toBe(0);
    expect(report.counts.unknown).toBe(1);
    expect(report.status).toBe("UNKNOWN");
    expect(report.details[0].patchDigest).toBeNull();
  });
});

describe("SAN-1609 quality, budget and provider run metrics", () => {
  it("does not report 100% proven coverage for an empty file inventory", () => {
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD,
      files: [], expectedCount: 0, reviewBody: complete });
    expect(report.quality.verifiedFiles).toBe(0);
    expect(report.quality.percentVerified).toBeNull();
    expect(report.body).toContain("unknown (no changed files)");
    expect(report.body).not.toContain("100%");
  });

  it("never rounds 199/200 proven files up to a false 100% coverage claim", () => {
    const files = Array.from({ length: 200 }, (_, i) => ({
      filename: `src/components/Item${String(i).padStart(3, "0")}.tsx`,
      ...(i < 199 ? { patch: "+x" } : {}),
    }));
    const result = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD,
      files, expectedCount: files.length, reviewBody: complete });
    expect(result.quality.verifiedFiles).toBe(199);
    expect(result.quality.percentVerified).toBeLessThan(100);
    expect(result.body).not.toContain("(100%)");
    expect(result.status).toBe("UNKNOWN");
  });

  it("never shows 100% when GitHub's changed-file inventory is incomplete", () => {
    const files = [
      { filename: "src/components/ExampleA.tsx", patch: "+x" },
      { filename: "src/components/ExampleB.tsx", patch: "+x" },
    ];
    const result = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD,
      files, expectedCount: files.length + 1, reviewBody: complete });
    expect(result.counts.aiReviewed).toBe(2);
    expect(result.status).toBe("UNKNOWN");
    expect(result.quality.percentVerified).toBeLessThan(100);
    expect(result.body).not.toContain("(100%)");
  });

  it("reads only exact-head official review usage; unknown API cost is not zero", () => {
    const content = complete + "\n<details><summary><strong>⚙️ Agent run details</strong></summary>\n" +
      "- Model: openai/nvidia/nemotron-3.5-lightning-30b-a3b\n" +
      "- Tokens: 15,916 in / 5,188 out / 21,104 total\n" +
      "- Time cost: 63.9s\n- AI calls: 1\n</details>";
    const usage = parseReviewUsage(content, BASE, HEAD);
    expect(usage).toEqual({ model: "openai/nvidia/nemotron-3.5-lightning-30b-a3b",
      inputTokens: 15916, outputTokens: 5188, seconds: 63.9, calls: 1, estimatedUsd: null, costLabel: null });
    expect(parseReviewUsage(content, BASE, "c".repeat(40)).calls).toBeNull();
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD,
      files: [{ filename: "src/security/auth.ts", patch: "+x" }], expectedCount: 1, reviewBody: content });
    expect(report.quality.verifiedFiles).toBe(1);
    expect(report.quality.percentVerified).toBe(100);
    expect(report.body).toContain("unknown (not $0)");
    const priced = content.replace("- AI calls: 1", "- AI calls: 1\n- Estimated API cost: $0.0800 USD");
    expect(parseReviewUsage(priced, BASE, HEAD).estimatedUsd).toBe(0.08);
    expect(readFileSync(".pr_agent.toml", "utf8")).toContain("output_run_cost = true");
  });
  it("parses the EXACT pinned v0.49.0 run-details HTML and multi-model fallback safely", () => {
    // Actual upstream show_run_details(gfm_supported=true) has a space between
    // <details> and <summary>; the old parser silently ignored the entire block.
    const source = complete + "\n<hr>\n<details> <summary><strong>⚙️ Agent run details</strong></summary>\n\n" +
      "- Models: openai/nvidia/nemotron-3.5-lightning-30b-a3b, openai/nvidia/nemotron-3.5-super-vl-120b-a12b (includes fallback)\n" +
      "- Tokens: 15,916 in / 5,188 out / 21,104 total\n" +
      "- Time cost: 63.9s\n- AI calls: 2\n" +
      "- Estimated API cost: unavailable (no calls could be priced)\n\n</details>\n";
    const data = parseReviewUsage(source, BASE, HEAD);
    expect(data).toMatchObject({
      model: "openai/nvidia/nemotron-3.5-lightning-30b-a3b, openai/nvidia/nemotron-3.5-super-vl-120b-a12b (includes fallback)",
      inputTokens: 15916, outputTokens: 5188, seconds: 63.9, calls: 2,
      estimatedUsd: null, costLabel: null,
    });
    const report = buildCoverageReport({ repo: "a/b", number: 7, baseSha: BASE, headSha: HEAD,
      files: [{ filename: "src/mastra/agent.ts", patch: "+x" }], expectedCount: 1, reviewBody: source });
    expect(report.body).toContain("nemotron-3.5-super-vl-120b-a12b");
    expect(report.body).toContain("includes fallback");
    expect(report.body).toContain("unknown (not $0)");
    expect(parseReviewUsage(source, BASE, "c".repeat(40)).calls).toBeNull();
  });

  it("rejects oversized or malformed provider model names without ambiguous regex work", () => {
    // Keep model values as separate fixture data. No HTML interpolation,
    // and no change to the exact upstream review-details markup.
    const fixture = (label: string) => [
      complete,
      "\n<hr>\n<details> <summary><strong>⚙️ Agent run details</strong></summary>\n\n- Model: ",
      label,
      "\n- Time cost: 1.1s\n- AI calls: 1\n\n</details>\n",
    ].join("");
    expect(parseReviewUsage(fixture("a".repeat(1025)), BASE, HEAD).model).toBeNull();
    expect(parseReviewUsage(fixture("openai/nvidia/model, "), BASE, HEAD).model).toBeNull();
    expect(parseReviewUsage(fixture("model), ("), BASE, HEAD).model).toBeNull();
    expect(parseReviewUsage(fixture("openai/nvidia/lightning (fallback)"), BASE, HEAD).model)
      .toBe("openai/nvidia/lightning (fallback)");
  });

  it("reports exact small or partially priced costs without claiming full pricing", () => {
    const header = complete + "\n<hr>\n<details> <summary><strong>⚙️ Agent run details</strong></summary>\n\n" +
      "- Model: openai/nvidia/nemotron-3.5-lightning-30b-a3b\n- Time cost: 1.1s\n- AI calls: 2\n";
    const small = parseReviewUsage(header + "- Estimated API cost: <$0.01 USD\n\n</details>", BASE, HEAD);
    expect(small.estimatedUsd).toBeNull();
    expect(small.costLabel).toBe("<$0.01 USD");
    const partial = parseReviewUsage(header +
      "- Estimated API cost: $0.08 USD (partial: 1 of 2 successful calls priced)\n\n</details>", BASE, HEAD);
    expect(partial.estimatedUsd).toBe(0.08);
    expect(partial.costLabel).toBe("$0.08 USD (partial: 1 of 2 successful calls priced)");
    const report = buildCoverageReport({ repo: "a/b", number: 7, baseSha: BASE, headSha: HEAD,
      files: [{ filename: "src/mastra/agent.ts", patch: "+x" }], expectedCount: 1,
      reviewBody: header + "- Estimated API cost: $0.08 USD (partial: 1 of 2 successful calls priced)\n\n</details>" });
    expect(report.body).toContain("$0.08 USD (partial: 1 of 2 successful calls priced)");
    expect(report.body).not.toContain("Estimated API cost: $0.0800 USD.");
  });

  it("packs 100 unreviewed files into bounded batches without generating AI results", () => {
    const files = Array.from({ length: 100 }, (_, i) => ({
      filename: i === 0 ? "src/security/a.ts" : "src/components/Item" + String(i).padStart(3,"0") + ".tsx",
      patch: "+" + "x".repeat(999) }));
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD,
      files, expectedCount: 100 });
    expect(report.status).toBe("UNKNOWN");
    expect(report.counts.aiReviewed).toBe(0);
    expect(report.plan.batches.length).toBeGreaterThan(1);
    expect(report.plan.batches.flatMap((batch: { paths: string[] }) => batch.paths)).toHaveLength(100);
    expect(report.plan.deferred).toHaveLength(0);
    expect(report.plan.batches.every((batch: { patchBytes: number }) => batch.patchBytes <= 35000)).toBe(true);
    expect(report.plan.batches[0].paths[0]).toBe("src/security/a.ts");
    expect(report.body).toContain("Planning only");
    const done = [{ ...report.plan.batches[0], complete: true }];
    expect(planFollowupBatches(report, { baseSha: BASE, headSha: HEAD, completed: done }).batches).toHaveLength(report.plan.batches.length - 1);
  });
  it("handles 300 large files without exceeding 6 calls or claiming complete coverage", () => {
    const files = Array.from({ length: 300 }, (_, i) => ({
      filename: "src/components/Component" + String(i).padStart(4,"0") + ".tsx",
      patch: "+" + "x".repeat(3999) }));
    const report = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD,
      files, expectedCount: 300 });
    expect(report.plan.batches).toHaveLength(6);
    expect(report.plan.deferred.length).toBeGreaterThan(0);
    expect(report.plan.batches.flatMap((batch: { paths: string[] }) => batch.paths).length + report.plan.deferred.length).toBe(300);
    expect(report.plan.batches.every((batch: { patchBytes: number }) => batch.patchBytes <= 35000)).toBe(true);
    expect(report.quality.percentVerified).toBe(0);
    const incomplete = buildCoverageReport({ repo: "a/b", number: 1, baseSha: BASE, headSha: HEAD,
      files, expectedCount: 301 });
    expect(incomplete.status).toBe("UNKNOWN");
    expect(incomplete.body).toContain("Inventory UNKNOWN");
  });
});
