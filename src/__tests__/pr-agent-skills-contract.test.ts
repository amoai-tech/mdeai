import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEncoding } from "js-tiktoken";

const read = (path: string) =>
  readFileSync(path, "utf8");

const workflow = read(".github/workflows/pr-agent.yml");
const config = read(".pr_agent.toml");
const guidelines = read("docs/06-testing/pr-review-guidelines.md");
const routing = read("scripts/select-pr-agent-skills.mjs");
const reviewPolicy = read("scripts/pr-agent/review-policy.mjs");
const evidenceBuilder = read("scripts/pr-agent/build-evidence.mjs");

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
  it("delegates runtime to the immutable shared core and keeps the caller trust boundary", () => {
    expect(workflow).toContain("amoai-tech/pr-review-infra/.github/workflows/pr-agent.yml@a3c9600de7a31184266fade8387359ccbb8e6d68");
    expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow).toContain('NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}');
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).not.toContain("docker://pragent/pr-agent");
    expect(workflow).not.toContain("NVIDIA_NIM_API_BASE");
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
    expect(config).toContain("YAML serialization requirement");
    expect(config).toContain(
      "For every free-text field in the PR-Agent review, always use a YAML block scalar (`|`) with indented content",
    );
    expect(config).toContain("Never start an unquoted YAML scalar with a backtick");
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

  it("keeps the repo-local base-aware review-policy contract", () => {
    expect(reviewPolicy).toContain("export const CERT_HISTORY_MARKER");
    expect(reviewPolicy).toContain("export function selectReviewCommand");
    expect(reviewPolicy).toContain("export function verifyReviewResult");
    expect(reviewPolicy).toContain("export function appendCertification");
    expect(reviewPolicy).toContain("pr-agent:review:incremental");
    expect(reviewPolicy).toContain("pr-agent:review:full");
    expect(reviewPolicy).toContain("mde-pr-agent-cert base=");
  });

  it("keeps repo-local routing while shared core owns review orchestration", () => {
    expect(workflow).toContain("evidence_title: MDE PR-Agent Evidence");
    expect(routing).toContain("required trusted PR-Agent skill missing");
    expect(routing).toContain("return 6000;");
    expect(routing).toContain("max_tokens=${result.maxTokens}");
    expect(workflow).not.toContain("max_tokens=8000");
  });
});

describe("SAN-1332 evidence-backed review contract", () => {
  it("keeps repo-local exact-version evidence while shared core owns injection", () => {
    expect(evidenceBuilder).toContain("export function buildEvidence");
    expect(evidenceBuilder).toContain('args["changed-files-file"]');
    expect(workflow).toContain("evidence_title: MDE PR-Agent Evidence");
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
    const packageJson = JSON.parse(read("package.json")) as { devDependencies?: Record<string, string> };
    expect(packageJson.devDependencies?.["js-tiktoken"]).toBe("1.0.21");
    expect(routing).toContain("return 6000");
  });
});
