import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEncoding } from "js-tiktoken";

const read = (path: string) =>
  readFileSync(path, "utf8");

const workflow = read(".github/workflows/pr-agent.yml");
const config = read(".pr_agent.toml");
const guidelines = read("docs/06-testing/pr-review-guidelines.md");
const routing = read("scripts/select-pr-agent-skills.mjs");

const skills = [
  ".claude/skills/code-review/SKILL.md",
  ".claude/skills/copilotkit-review/SKILL.md",
  ".claude/skills/mastra-review/SKILL.md",
  ".claude/skills/supabase-review/SKILL.md",
  ".claude/skills/maps-review/SKILL.md",
  ".claude/skills/stripe-review/SKILL.md",
  ".claude/skills/ci-review/SKILL.md",
  ".claude/skills/nextjs-review/SKILL.md",
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
    expect(config).toContain('repo_context_files = ["AGENTS.md", "docs/06-testing/pr-review-guidelines.md", "package.json"]');
    expect(config).toContain("persistent_finding_state = true");
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
    expect(config).toContain("adversarial");
    expect(config).toContain("falsify");
  });

  it("keeps the compact MDE stack review contract", () => {
    for (const domain of ["CopilotKit", "Mastra", "Supabase", "Google Maps / Places", "Stripe", "Next.js"]) {
      expect(guidelines).toContain(domain);
    }
    expect(guidelines).toContain("User A vs User B denial proof");
    expect(guidelines).toContain("A green test is evidence only if it exercises the changed failure path");
    expect(guidelines).toContain("falsify");
  });

  it("ships all required review-only specialist skills", () => {
    for (const path of skills) {
      expect(existsSync(path)).toBe(true);
      const body = read(path);
      expect(body).toContain("Source of truth");
      expect(body).toContain("Review invariants");
      expect(routing).toContain(path.replace(".claude/skills/", "").replace("/SKILL.md", ""));
    }
  });

  it("protects high-risk domain invariants from silent removal", () => {
    expect(read(skills[1])).toContain("Browser-supplied user, tenant, thread, run, page, or resource IDs are not authorization");
    expect(read(skills[1])).toContain("npm run typecheck");
    expect(read(skills[2])).toContain("RequestContext carries request metadata; it is not authorization by itself");
    expect(read(skills[3])).toContain("User A must not read, update, delete or create data as User B");
    expect(read(skills[4])).toContain("Do not invent or transform ungrounded");
    expect(read(skills[4])).toContain("field mask");
    expect(read(skills[5])).toContain("duplicate delivery must not duplicate tickets");
    expect(read(skills[6])).toContain("silent skip");
    expect(read(skills[7])).toContain("package.json");
    expect(read(skills[7])).toContain("Next.js 16");
    expect(read(skills[7])).toContain("await cookies()");
    expect(read(skills[7])).toContain("Async Request APIs");
  });

  it("uses incremental push review without full synchronize review", () => {
    expect(workflow).toContain('github_action_config.handle_push_trigger: "true"');
    expect(workflow).toContain(`github_action_config.push_commands: '["/review -i"]'`);
    expect(workflow).toContain(`github_action_config.pr_actions: '["opened", "reopened", "ready_for_review"]'`);
    expect(workflow).toContain("actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3");
    expect(workflow).toContain("scripts/select-pr-agent-skills.mjs");
    expect(workflow).toContain("trusted PR-Agent routing script missing from base branch");
    expect(routing).toContain("required trusted PR-Agent skill missing");
    expect(workflow).toContain("verify-review-result:");
    expect(workflow).toContain("getWorkflowRun");
    expect(workflow).toContain("pr-agent:review:incremental");
    expect(workflow).toContain("PR-Agent did not publish a fresh review for this workflow run");
    expect(workflow).toContain("Standalone PR Review");
    expect(workflow).toContain("PR-Agent could not safely update the persistent review");
    expect(workflow).toContain('body.includes("## MDE PR Review")');
    expect(workflow).not.toContain("max_tokens=8000");
  });
});

describe("SAN-1332 evidence-backed review contract", () => {
  it("builds and injects a non-empty exact-version evidence artifact", () => {
    expect(workflow).toContain("Checkout PR head lockfile as untrusted data");
    expect(workflow).toContain("scripts/pr-agent/build-evidence.mjs");
    expect(workflow).toContain("test -s .pr-agent/evidence.md");
    expect(workflow).toContain("if ! node scripts/pr-agent/build-evidence.mjs");
    expect(workflow).toContain("Evidence generation failed; framework/API claims are advisory only.");
    expect(workflow).toContain("PR head package-lock.json missing or empty");
    expect(workflow).toContain('ARTIFACT_PATH: ".pr-agent/evidence.md"');
    expect(config).toContain("[artifacts]");
    expect(config).toContain('artifact_label = "MDE exact-version verification evidence"');
    expect(config).toContain('target_tools = ["pr_reviewer", "pr_code_suggestions"]');
  });

  it("downgrades unsupported framework claims instead of blocking merge", () => {
    expect(config).toContain("VERIFIED");
    expect(config).toContain("NEEDS VERIFICATION");
    expect(config).toContain("cannot independently block merge");
    expect(config).toContain("Exact version evidence alone does not prove a specific API claim");
    expect(read(skills[7])).toContain("`src/proxy.ts`");
  });
});

describe("SAN-1332 skill-budget checkpoint", () => {
  it("keeps every package.json review skill inside the configured budget", () => {
    const selected = [
      "code-review", "copilotkit-review", "mastra-review", "supabase-review",
      "maps-review", "stripe-review", "nextjs-review",
    ];
    const rendered = selected.map((name) => read(`.claude/skills/${name}/SKILL.md`)).join("\n\n---\n\n");
    const tokenCounts = (["cl100k_base", "o200k_base"] as const).map((encodingName) => {
      const encoding = getEncoding(encodingName);
      return encoding.encode(rendered).length;
    });
    expect(Math.max(...tokenCounts)).toBeLessThanOrEqual(6000);
    expect(read("package.json")).toContain('"js-tiktoken": "1.0.21"');
    expect(routing).toContain("return 6000");
  });
});
