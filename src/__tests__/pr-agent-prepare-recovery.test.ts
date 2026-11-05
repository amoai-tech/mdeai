import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { reviewEnvelope } from "../../scripts/pr-agent/review-policy.mjs";
import { exactFileDiff, selectRecoveryTarget, prepareRecoveryFromGithub, validateTargetedModelOutput, verifyRecoveredCoverage } from "../../scripts/pr-agent/prepare-recovery.mjs";

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


describe("SAN-1640 targeted model findings require changed-line evidence", () => {
  const patch = exactFileDiff(path, "const a = 1;\n", "const a = 2;\n");
  const model = {
    review: { "estimated_effort_to_review_[1-5]": 2,
      relevant_tests: "No\n", security_concerns: "No",
      key_issues_to_review: [
        { relevant_file: path + "\n", issue_header: "Changed line",
          issue_content: "Specific defect", start_line: 1, end_line: 1 },
      ] },
    coverage: { files_not_reviewed: [], files_partially_reviewed: [] },
  };
  it("accepts an exact file change and trims harmless YAML whitespace", () => {
    expect(validateTargetedModelOutput({output:model,diff:patch.diff,path})).toMatchObject({
      ok:true, rejectedFindings:0, coverageComplete:true,
      findings:[{path,title:"Changed line",startLine:1,endLine:1}],
    });
  });
  it("discards invented anchors and other-file findings without claiming completion", () => {
    const altered={...model,review:{...model.review,key_issues_to_review:[
      ...model.review.key_issues_to_review,
      {relevant_file:path,issue_header:"No changed line",issue_content:"Unsupported",
        start_line:99,end_line:100},
      {relevant_file:"src/payment.ts",issue_header:"Wrong file",issue_content:"Unsupported",
        start_line:1,end_line:1},
    ]}};
    expect(validateTargetedModelOutput({output:altered,diff:patch.diff,path})).toMatchObject({
      ok:true,rejectedFindings:2,coverageComplete:true,findingsGrounded:false,findings:[{path,startLine:1}],
    });
  });
  it("counts grounded findings above the display cap separately from hallucinations", () => {
    const repeated = { ...model, review: { ...model.review,
      key_issues_to_review: Array.from({ length: 7 }, (_, i) => ({
        ...model.review.key_issues_to_review[0], issue_header: "Grounded " + i,
      })) } };
    expect(validateTargetedModelOutput({ output: repeated, diff: patch.diff, path }))
      .toMatchObject({ ok: true, coverageComplete: true, rejectedFindings: 0,
        truncatedFindings: 1, findingsGrounded: true });
  });

  it("rejects untyped review, missing coverage and incomplete model coverage", () => {
    expect(validateTargetedModelOutput({output:{review:model.review},diff:patch.diff,path}).ok).toBe(false);
    expect(validateTargetedModelOutput({output:{...model,review:{...model.review,relevant_tests:false}},
      diff:patch.diff,path}).ok).toBe(false);
    expect(validateTargetedModelOutput({output:model,diff:patch.diff,path:"../file.ts"}).ok).toBe(false);
    expect(validateTargetedModelOutput({output:{...model,coverage:{
      files_not_reviewed:[path],files_partially_reviewed:[]}},diff:patch.diff,path})
      .coverageComplete).toBe(false);
  });
});


describe("SAN-1640 combined original and supplemental review certification", () => {
  const diffProof = exactFileDiff(path, "const a = 1;\n", "const a = 2;\n");
  const plan = {baseSha,headSha,path,risk:"high",source:"exact-blob-diff",
    bounded:true,diffSha256:diffProof.diffSha256,patchBytes:diffProof.patchBytes};
  const output = {review:{"estimated_effort_to_review_[1-5]":2,
    relevant_tests:"No\n", security_concerns:"No",
    key_issues_to_review:[{relevant_file:path+"\n",issue_header:"Grounded",
      issue_content:"Supported patch line",start_line:1,end_line:1}]},
    coverage:{files_not_reviewed:[],files_partially_reviewed:[]}};
  const verify = (override={}) => verifyRecoveredCoverage({reviewBody,baseSha,headSha,
    files,expectedCount:1,plan,diff:diffProof.diff,output,...override});
  it("reports source-bound model coverage as advisory, never a merge certificate", () => {
    expect(verify()).toMatchObject({ok:true,code:"TARGETED_RECOVERY_ADVISORY",path,
      diffSha256:diffProof.diffSha256,findings:[{path,startLine:1}]});
    expect(verify().reason).toContain("advisory only");
    expect(verify()).not.toMatchObject({code:"RECOVERED_COVERAGE"});
  });
  it("fails on stale revision, wrong target, substituted patch or incomplete provider result", () => {
    expect(verify({headSha:"c".repeat(40)}).ok).toBe(false);
    expect(verify({plan:{...plan,path:"src/payments.ts"}}).ok).toBe(false);
    expect(verify({diff:diffProof.diff+"\n+tamper"}).ok).toBe(false);
    expect(verify({output:{...output,coverage:{
      files_not_reviewed:[path],files_partially_reviewed:[]}}}).ok).toBe(false);
    expect(verify({reviewBody:reviewBody.replace('"complete":false','"complete":true')}).ok)
      .toBe(false);
  });
});
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

  it("delegates targeted model recovery to the immutable shared reviewer only", () => {
    const workflow = readFileSync(".github/workflows/pr-agent.yml", "utf8");
    const yaml = parseDocument(workflow);
    expect(yaml.errors).toEqual([]);
    const jobs = yaml.toJS() as { jobs: Record<string, {
      name: string; "timeout-minutes": number; steps: Array<{ name: string; id?: string }>;
    }> };
    const smart = jobs.jobs["smart-coverage"];
    expect(smart["timeout-minutes"]).toBe(12);
    expect(smart.name).toContain("advisory");
    expect(smart.steps.map((step) => step.name)).toEqual([
      "Checkout trusted base policy",
      "Report exact-commit coverage (no PR-head code execution)",
    ]);
    expect(workflow).toContain("hasPublishedPartialReview");
    expect(workflow).toContain("staleTargetedRecoveryComments(comments, baseSha, headSha)");
    expect(workflow).toContain("Targeted PR-Agent follow-up — OUTDATED");
    expect(workflow).toContain("REVIEW_JOB_RESULT: " + "$" + "{{ needs.review.result }}");
    expect(workflow).not.toContain("Re-review missing patch with pinned PR-Agent v0.49.0");
    expect(workflow).not.toContain("--diff-file /review/recovery.diff");
    expect(workflow).not.toContain("OPENAI_API_KEY");
    expect(workflow).not.toContain("recovery-model");
    expect(workflow).toMatch(/^    uses: amoai-tech\/pr-review-infra\/\.github\/workflows\/pr-agent\.yml@[0-9a-f]{40}$/m);
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
