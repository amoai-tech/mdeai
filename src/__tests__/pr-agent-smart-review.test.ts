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
    expect(source).toContain("pr-review-infra/.github/workflows/pr-agent.yml@901e85f5ba4dcce6b5d112ab63630a0da4bc1f1d");
  });
});
