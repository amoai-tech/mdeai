import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

const workflow = readFileSync(".github/workflows/pr-agent.yml", "utf8");
const evidenceBuilder = readFileSync("scripts/pr-agent/build-evidence.mjs", "utf8");
const sharedSha = "8c6ce4c09fb08fc58c6b57686acb3bea987a6066";

describe("IPI-1246 shared PR-Agent caller contract", () => {
  it("pins MDE to the immutable shared workflow", () => {
    expect(workflow).toContain(`amoai-tech/pr-review-infra/.github/workflows/pr-agent.yml@${sharedSha}`);
    expect(workflow).toContain("evidence_title: MDE PR-Agent Evidence");
    expect(workflow).toContain("NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}");
    expect(workflow).toContain("GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}");
  });

  it("parses both provider secrets as children of the reusable workflow secrets mapping", () => {
    const readNestedSecrets = (source: string) => {
      const parsed = parseDocument(source);
      expect(parsed.errors).toEqual([]);
      const jobs = parsed.toJS() as {
        jobs: { review: { secrets: Record<string, string> } };
      };
      return jobs.jobs.review.secrets;
    };

    expect(readNestedSecrets(workflow)).toEqual({
      NVIDIA_API_KEY: "${{ secrets.NVIDIA_API_KEY }}",
      GOOGLE_GENERATIVE_AI_API_KEY: "${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}",
    });

    // The bot suggested this incorrect indentation. Prove the test would reject it.
    const wrongIndent = workflow.replace(
      /^      GOOGLE_GENERATIVE_AI_API_KEY:/m,
      "    GOOGLE_GENERATIVE_AI_API_KEY:",
    );
    expect(readNestedSecrets(wrongIndent)).not.toHaveProperty("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("keeps the caller security boundary explicit", () => {
    expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("pull-requests: write");
  });

  it("removes duplicated provider and PR-Agent runtime wiring from MDE", () => {
    expect(workflow).not.toContain("docker://pragent/pr-agent");
    expect(workflow).not.toContain("nemotron-3-ultra");
    expect(workflow).not.toContain("NVIDIA_NIM_API_BASE");
  });

  it("uses the shared file-based changed-file transport contract", () => {
    expect(evidenceBuilder).toContain('args["changed-files-file"]');
    expect(evidenceBuilder).toContain('missing --changed-files-file or --changed-files');
  });
});
