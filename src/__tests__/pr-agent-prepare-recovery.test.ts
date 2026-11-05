import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { reviewEnvelope } from "../../scripts/pr-agent/review-policy.mjs";
import { exactFileDiff, selectRecoveryTarget, prepareRecoveryFromGithub } from "../../scripts/pr-agent/prepare-recovery.mjs";

const baseSha = "a".repeat(40), headSha = "b".repeat(40);
const path = "src/components/events/event-ticket-tiers.tsx";
const headBlobSha = "f".repeat(40);
const files = [{ filename: path, status: "modified", sha: headBlobSha, patch: "@@ -1 +1 @@\n-a\n+b" }];
const reviewBody = `${reviewEnvelope({ baseSha, headSha, command: "/review", type: "canonical" })}
<!-- pr-agent:review:full -->
## MDE PR Review

⚠️ **Review coverage:** The following files were not included in this review because of the token budget:
- \`${path}\`

<!-- pr-agent-review-state:v1
${JSON.stringify({ schema_version: 1, findings: [],
  last_run: { head_sha: headSha, complete: false, excluded_files: [path], kind: "partial" } })}
-->`;

describe("SAN-1640 exact-source recovery preparation", () => {
  it("builds an actual complete unified diff without executing source code", () => {
    const result = exactFileDiff(path, "const a = 1;\n", "const a = 2;\n");
    expect(result.ok).toBe(true);
    expect(result.diff).toContain(`diff --git a/${path} b/${path}`);
    expect(result.diff).toContain("@@ -1 +1 @@");
    expect(result.diff).toContain("-const a = 1;");
    expect(result.diff).toContain("+const a = 2;");
    expect(result.diffSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("skips binary, unsafe paths, unchanged files and oversized patch requests", () => {
    expect(exactFileDiff("../config.ts", "a", "b").ok).toBe(false);
    expect(exactFileDiff(path, "\0binary", "text").ok).toBe(false);
    expect(exactFileDiff(path, "a\n", "a\n").ok).toBe(false);
    expect(exactFileDiff(path, "a\n", "b\n", 0).ok).toBe(false);
    expect(exactFileDiff(path, "a\n", "b\n", 35).reason).toContain("budget");
    expect(exactFileDiff(path, "a\n", "b\n", 35001).ok).toBe(false);
  });

  it("selects a real high-risk omitted ticket-picker patch from the exact head", () => {
    expect(selectRecoveryTarget({ reviewBody, baseSha, headSha, files, expectedCount: 1 }))
      .toMatchObject({ ok: true, path, risk: "high" });
    expect(selectRecoveryTarget({ reviewBody, baseSha, headSha: "c".repeat(40), files, expectedCount: 1 }).ok).toBe(false);
    expect(selectRecoveryTarget({ reviewBody, baseSha, headSha, files, expectedCount: 2 }).ok).toBe(false);
    expect(selectRecoveryTarget({ reviewBody, baseSha, headSha, files: [{ ...files[0], status: "renamed" }], expectedCount: 1 }).ok).toBe(false);
    expect(selectRecoveryTarget({ reviewBody, baseSha, headSha, files: [{ filename: path, status: "modified" }], expectedCount: 3000 }).ok).toBe(false);
  });

  it("rejects unlisted, multiple or failed-chunk review gaps", () => {
    const omittedMore = reviewBody.replace(`- \`${path}\``, `- \`${path}\`\n... and 7 more`);
    expect(selectRecoveryTarget({ reviewBody: omittedMore, baseSha, headSha, files, expectedCount: 1 }).ok).toBe(false);
    const failed = reviewBody +
      "\n\n<hr>\n\nℹ️ **Chunked review:** the diff exceeded the model token budget, so it was reviewed in 3 chunks and the per-chunk results were merged. 1 chunk(s) failed and are not covered by this review.\n";
    expect(selectRecoveryTarget({ reviewBody: failed, baseSha, headSha, files, expectedCount: 1 }).ok).toBe(false);
  });

  it("retains a valid, bounded, advisory-only workflow with the pinned reviewer", () => {
    const workflow = readFileSync(".github/workflows/pr-agent.yml", "utf8");
    const yaml = parseDocument(workflow);
    expect(yaml.errors).toEqual([]);
    const jobs = yaml.toJS() as { jobs: Record<string, {
      name: string; "timeout-minutes": number; steps: Array<{ name: string; id?: string }>;
    }> };
    const smart = jobs.jobs["smart-coverage"];
    expect(smart["timeout-minutes"]).toBe(12);
    expect(smart.name).toContain("advisory");
    expect(smart.steps.map((step) => step.name)).toEqual(expect.arrayContaining([
      "Prepare bounded exact-blob recovery",
      "Re-review missing patch with pinned PR-Agent v0.49.0",
      "Publish bounded review findings (advisory; no false certificate)",
    ]));
    expect(workflow).toContain("pragent/pr-agent@sha256:b1ed6e8de56eb4d6e4169ee0d5c209bb5ed1ef071a01c0c042c64b80192a785c");
    expect(workflow).toContain("--diff-file /review/recovery.diff");
    expect(workflow).toContain("--json-output /review/recovery.json");
    expect(workflow).toContain("The shared reviewer must verify combined coverage before merge.");
    expect(workflow).not.toContain("-e GITHUB_TOKEN");
  });

  it("fetches only the base and head file blobs and aborts on stale PR", async () => {
    const calls: string[] = [];
    let moved = false;
    const github = {
      rest: {
        pulls: {
          get: async () => { calls.push("pr"); return { data: { base: { sha: baseSha },
            head: { sha: moved ? "c".repeat(40) : headSha }, changed_files: 1 } }; },
          listFiles: async () => undefined,
        },
        repos: {
          getContent: async ({ ref }: { ref: string }) => {
            calls.push(ref);
            const text = ref === baseSha ? "const old = 1;\n" : "const old = 2;\n";
            return { data: { type: "file", encoding: "base64",
              sha: ref === headSha ? headBlobSha : "e".repeat(40),
              size: Buffer.byteLength(text), content: Buffer.from(text).toString("base64") } };
          },
        },
      },
      paginate: async () => files,
    };
    const recovered = await prepareRecoveryFromGithub({ github, owner: "amoai-tech", repo: "mdeai",
      pullNumber: 756, baseSha, headSha, reviewBody });
    expect(recovered).toMatchObject({ ok: true, path, bounded: true, source: "exact-blob-diff" });
    expect(calls).toEqual(["pr", baseSha, headSha, "pr"]);
    // The current PR files API SHA is authoritative for the head blob.
    const swapped = { ...github, paginate: async () => [{ ...files[0], sha: "1".repeat(40) }] };
    await expect(prepareRecoveryFromGithub({ github: swapped, owner: "amoai-tech", repo: "mdeai",
      pullNumber: 756, baseSha, headSha, reviewBody })).resolves.toMatchObject({
      ok: false, reason: "exact-head blob SHA does not match current PR inventory",
    });
    moved = true;
    await expect(prepareRecoveryFromGithub({ github, owner: "amoai-tech", repo: "mdeai",
      pullNumber: 756, baseSha, headSha, reviewBody })).resolves.toMatchObject({
      ok: false, reason: expect.stringContaining("STALE_PR_REVISION"),
    });
  });
});
