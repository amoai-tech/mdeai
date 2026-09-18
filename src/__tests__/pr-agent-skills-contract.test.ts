import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8");

const workflow = read(".github/workflows/pr-agent.yml");
const config = read(".pr_agent.toml");
const guidelines = read("docs/pr-review-guidelines.md");

const skills = [
  ".claude/skills/copilotkit-review/SKILL.md",
  ".claude/skills/mastra-review/SKILL.md",
  ".claude/skills/supabase-review/SKILL.md",
  ".claude/skills/maps-review/SKILL.md",
  ".claude/skills/stripe-review/SKILL.md",
];

describe("SAN-1312 PR-Agent review contract", () => {
  it("pins PR-Agent and loads reviewer instructions only from the trusted base", () => {
    expect(workflow).toContain("docker://pragent/pr-agent@sha256:548b760b81ab4b3f729182428695ccc1194bbf87528c2b1e2b2b07e5223af7b6 # v0.45.0");
    expect(workflow).toContain("ref: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("Select trusted MDE review skills");
    expect(workflow).toContain('github_action_config.auto_improve: "false"');
    expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow).toContain('NVIDIA_NIM_API_BASE: "https://integrate.api.nvidia.com/v1"');
    expect(workflow).toContain('NVIDIA_NIM_API_KEY: ${{ secrets.NVIDIA_API_KEY }}');
    expect(workflow).toContain('config.model: "nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b"');
    expect(workflow).toContain(`config.fallback_models: '["nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b"]'`);
    expect(workflow).toContain('config.custom_model_max_tokens: "32000"');
    expect(workflow).not.toContain("GOOGLE_AI_STUDIO");
    expect(workflow).not.toContain("gemini/");
  });

  it("keeps policy in repository config with trusted context and restricted mode", () => {
    expect(config).toContain('review_heading = "MDE PR Review"');
    expect(config).toContain('repo_context_files = ["AGENTS.md", "docs/pr-review-guidelines.md"]');
    expect(config).toContain("repo_context_from_default_branch = true");
    expect(config).toContain("restricted_mode = true");
    expect(config).toContain("[ignore]");
    expect(config).toContain('glob = [');
    expect(config).toContain('"package-lock.json"');
    expect(config).not.toContain('"docs/**"');
    expect(config).not.toContain("glob_patterns");
    expect(config).toContain("Severity: BLOCKER | HIGH | MEDIUM | LOW");
    expect(config).toContain("Failure scenario:");
    expect(config).toContain("Expected result:");
    expect(config).toContain("Deterministic CI and human review remain authoritative");
  });

  it("keeps the compact MDE stack review contract", () => {
    for (const domain of ["CopilotKit", "Mastra", "Supabase", "Google Maps / Places", "Stripe", "Next.js"]) {
      expect(guidelines).toContain(domain);
    }
    expect(guidelines).toContain("User A vs User B denial proof");
  });

  it("ships all required review-only specialist skills", () => {
    for (const path of skills) {
      expect(existsSync(path)).toBe(true);
      const body = read(path);
      expect(body).toContain("Source of truth");
      expect(body).toContain("Review invariants");
      expect(workflow).toContain("/github/workspace/" + path.replace("/SKILL.md", ""));
    }
  });

  it("protects high-risk domain invariants from silent removal", () => {
    expect(read(skills[0])).toContain("Browser-supplied user, tenant, thread, run, page, or resource IDs are not authorization");
    expect(read(skills[0])).toContain("npm run typecheck");
    expect(read(skills[1])).toContain("RequestContext carries request metadata; it is not authorization by itself");
    expect(read(skills[2])).toContain("User A must not read, update, delete or create data as User B");
    expect(read(skills[3])).toContain("Do not invent or transform ungrounded");
    expect(read(skills[3])).toContain("field mask");
    expect(read(skills[4])).toContain("duplicate delivery must not duplicate tickets");
  });
});
