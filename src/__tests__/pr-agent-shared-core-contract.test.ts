import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/pr-agent.yml", "utf8");
const evidenceBuilder = readFileSync("scripts/pr-agent/build-evidence.mjs", "utf8");
const sharedSha = "a3c9600de7a31184266fade8387359ccbb8e6d68";

describe("IPI-1246 shared PR-Agent caller contract", () => {
  it("pins MDE to the immutable shared workflow", () => {
    expect(workflow).toContain(`amoai-tech/pr-review-infra/.github/workflows/pr-agent.yml@${sharedSha}`);
    expect(workflow).toContain("evidence_title: MDE PR-Agent Evidence");
    expect(workflow).toContain("NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}");
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
