import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { reviewEnvelope, excludedFilesFromReview } from "../../scripts/pr-agent/review-policy.mjs";
import {
  buildCoverageReport, classifyFiles, planFollowupBatches,
  reviewCoverageFromComment, validateGeneratedJson, validateSnapshotReferences, COVERAGE_MARKER,
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
    expect(job.permissions).toEqual({ actions: "read", contents: "read", "pull-requests": "read", issues: "write" });
    expect(job.steps[0].with.ref).toBe("${{ github.event.pull_request.base.sha }}");
    expect(source).toContain("pr-review-infra/.github/workflows/pr-agent.yml@f37cb4a98626d55d4b6c8709d9ab2a2c6843bd2f");
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
    expect(planFollowupBatches(report, { baseSha: base, headSha: head, maxBatches: 1 }).batches[0].paths).toEqual(["src/z.ts"]);
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
