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

/**
 * Built once at module scope, not inside the test.
 *
 * `getEncoding` re-loads a multi-megabyte BPE vocabulary on every call and does not cache it:
 * measured at ~140ms for `cl100k_base` and ~380ms for `o200k_base` on an idle machine, again
 * on each repeat. Paying that inside the test put the whole test at ~460ms of pure vocabulary
 * loading, which under the full 281-file suite (many workers loading the same vocabularies at
 * once) could exceed the 5s default timeout and fail `floor` intermittently.
 *
 * Hoisting removes the load from the timed region. The measured budget is unchanged: same
 * encodings, same files, same 6000-token ceiling.
 */
const REVIEW_ENCODINGS = [getEncoding("cl100k_base"), getEncoding("o200k_base")];

const skills = [
  ".claude/skills/code-review/SKILL.md",
  ".claude/skills/copilotkit/references/review.md",
  ".claude/skills/mastra/references/review.md",
  ".claude/skills/supabase/references/review.md",
  ".claude/skills/maps/SKILL.md",
  ".claude/skills/stripe/references/review.md",
  ".claude/skills/nextjs/references/review.md",
];

describe("SAN-1312 PR-Agent review contract", () => {
  it("delegates runtime to the immutable shared core and keeps the caller trust boundary", () => {
    expect(workflow).toContain("amoai-tech/pr-review-infra/.github/workflows/pr-agent.yml@b97ecd0c2292e2850592c0416a4317802fa4cde0");
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

  it("ships all required review skills", () => {
    for (const path of skills) {
      expect(existsSync(path)).toBe(true);
      const body = read(path);
      expect(body).toContain("Source of truth");
      expect(body.toLowerCase()).toContain("review invariants");
      const owner = path.replace(".claude/skills/", "").split("/")[0];
      expect(routing).toContain(owner);
    }
  });

  it("protects high-risk domain invariants from silent removal", () => {
    expect(read(skills[1])).toContain("Browser-supplied user, tenant, thread, run, page, or resource IDs are not authorization");
    expect(read(skills[1])).toContain("npm run typecheck");
    const mastraReview = read(skills[2]);
    expect(mastraReview).toContain("RequestContext carries request metadata; it is not authorization by itself");
    expect(mastraReview).toContain("preserve trace correlation across agent, tool, and workflow boundaries");
    expect(mastraReview).toContain("must not log credentials, secrets, tokens, or sensitive request context");
    expect(mastraReview).toContain("Failed and retried executions must remain distinguishable");
    expect(read(skills[3])).toContain("User A must not read, update, delete or create data as User B");
    expect(read(skills[4])).toContain("Do not invent or transform ungrounded");
    expect(read(skills[4])).toContain("field mask");
    expect(read(skills[5])).toContain("duplicate delivery must not duplicate tickets");
    const ciReview = read(".claude/skills/code-review/references/ci-review.md");
    expect(ciReview).toContain("silent skip");
    expect(read(skills[6])).toContain("package.json");
    expect(read(skills[6])).toContain("Next.js 16");
    expect(read(skills[6])).toContain("await cookies()");
    expect(read(skills[6])).toContain("Async Request APIs");
  });

  it("keeps Mastra upstream provenance synchronized across the active wrapper and manifest", () => {
    const mastraSkill = read(".claude/skills/mastra/SKILL.md");
    const mastraUpstream = read(".claude/skills/mastra/upstream.yaml");
    const skillCommit = mastraSkill.match(/upstream-commit:\s*"([0-9a-f]{40})"/)?.[1];
    const manifestCommit = mastraUpstream.match(/reviewed_commit:\s*([0-9a-f]{40})/)?.[1];

    expect(skillCommit).toBeTruthy();
    expect(manifestCommit).toBeTruthy();
    expect(skillCommit).toBe(manifestCommit);
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

  it("states only freshness, never correctness certification", () => {
    // The exported names stay for shared-workflow compatibility; the operator-visible
    // wording must not imply the model review certifies correctness.
    expect(reviewPolicy).toContain("Fresh PR-Agent reviews recorded for exact base/head:");
    expect(reviewPolicy).not.toContain("PR-Agent certified review contexts");
    expect(reviewPolicy).toContain("does NOT prove");
  });

  it("validates the exact selected path instead of a rebuilt parent path", () => {
    expect(routing).toContain("export function toRepoPath");
    expect(routing).toContain("export function assertSelectedPathsExist");
    expect(routing).toContain("assertSelectedPathsExist(result.paths)");
    expect(routing).toContain("CONTAINER_WORKSPACE");
    // The old check looped over skill names and validated `<skill>/SKILL.md`.
    expect(routing).not.toContain("for (const skill of result.skills)");
  });

  it("owns the adversarial boundary-validation rule in the universal skill", () => {
    const codeReviewSkill = read(".claude/skills/code-review/SKILL.md");
    expect(codeReviewSkill).toContain("malformed near-miss inputs");
    expect(codeReviewSkill).toContain("leading zeros");
    expect(codeReviewSkill).toContain("standards-compliant library");
    // One owner: the rule is not duplicated into the always-on config layer.
    expect(config).not.toContain("malformed near-miss");
  });

  it("ships the review-quality eval corpus and its recorded model outputs", () => {
    for (const path of [
      "scripts/pr-agent/evals/cases.mjs",
      "scripts/pr-agent/evals/score-review.mjs",
      "scripts/pr-agent/evals/capture-review.mjs",
      "scripts/pr-agent/evals/fixtures/pr-157-v045-recorded.md",
      "scripts/pr-agent/evals/fixtures/pr-158-v045-recorded.md",
      "scripts/pr-agent/evals/fixtures/pr-163-canary-v045-recorded.md",
      "scripts/pr-agent/evals/fixtures/pr-163-canary-source.mjs",
    ]) {
      expect(existsSync(path)).toBe(true);
    }
    expect(read("scripts/pr-agent/evals/cases.mjs")).toContain("semver-boundary");
    expect(read("scripts/pr-agent/evals/cases.mjs")).toContain("docs-only-control");
    expect(read("scripts/pr-agent/evals/fixtures/pr-157-v045-recorded.md")).toContain("Safe to merge");
    // A real model-generated review, not synthetic wording.
    expect(read("scripts/pr-agent/evals/fixtures/pr-163-canary-v045-recorded.md")).toContain(
      "pr-agent-review-state:v1",
    );
  });

  it("requires a finding to be grounded in the exact changed source", () => {
    const scorer = read("scripts/pr-agent/evals/score-review.mjs");
    expect(scorer).toContain("export function checkGrounding");
    expect(scorer).toContain("export function quotedCodeFragments");
    expect(read("scripts/pr-agent/evals/cases.mjs")).toContain("sourceFile");
    // The captured canary source must not contain the pattern its review claimed was there.
    const canarySource = read("scripts/pr-agent/evals/fixtures/pr-163-canary-source.mjs");
    expect(canarySource).toContain("/^\\d+\\.\\d+\\.\\d+");
    expect(canarySource).not.toContain("\\d+\\.\\d+\\d+(");
  });

  it("never lets one finding supply another finding's verdict", () => {
    const scorer = read("scripts/pr-agent/evals/score-review.mjs");
    expect(scorer).toContain("export function findingVerdict");
    expect(scorer).toContain("blockingCredited");
    expect(scorer).toContain("!signals.safeToMerge");
  });

  it("scores one finding, never the whole review body", () => {
    const scorer = read("scripts/pr-agent/evals/score-review.mjs");
    expect(scorer).toContain("export function parseFindings");
    expect(scorer).toContain("export function isMaterialFinding");
    expect(scorer).toContain("export function matchCase");
    expect(scorer).toContain("pr-agent-review-state:v1");
    // Materiality must never be inferred from a bare severity word anywhere in the body:
    // "Risk level: High" is a risk assessment, not a finding.
    expect(scorer).not.toMatch(/body\.toUpperCase\(\)\.match\(/);
    expect(scorer).toContain("Risk level");
    // The example contract is literal, not a pattern that prose can satisfy.
    expect(read("scripts/pr-agent/evals/cases.mjs")).toContain("requiredExamples");
  });

  it("selects one certified review per head instead of concatenating reviews", () => {
    const policy = read("scripts/pr-agent/review-policy.mjs");
    expect(policy).toContain("export function hasCertificationForHead");
    expect(policy).toContain("export function selectCertifiedReviewForHead");
    const capture = read("scripts/pr-agent/evals/capture-review.mjs");
    expect(capture).toContain("selectCertifiedReviewForHead");
    expect(capture).toContain("refusing to score an unverified review");
    // The README must not document the older newest-wins shell selection.
    expect(read("scripts/pr-agent/evals/README.md")).not.toContain("sort_by(.updatedAt)");
  });

  it("does not configure keys the pinned PR-Agent cannot read", () => {
    // Verified against the shipped binary: `publish_error_details` first appears in the
    // v0.46.0 `settings/configuration.toml` and has no reader in v0.45.0. On the pinned
    // image it is a silent no-op, so the config must not claim the feature is active.
    if (workflow.includes("v0.45.0")) {
      expect(config).not.toMatch(/^\s*publish_error_details\s*=/m);
    }
    expect(config).toContain("publish_error_details` is a v0.46+ key");
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
    expect(read(".claude/skills/nextjs/references/review.md")).toContain("`src/proxy.ts`");
  });
});

describe("SAN-1332 skill-budget checkpoint", () => {
  it("keeps every package.json review skill inside the configured budget", () => {
    const rendered = [
      read(".claude/skills/code-review/SKILL.md"),
      read(".claude/skills/copilotkit/references/review.md"),
      read(".claude/skills/mastra/references/review.md"),
      read(".claude/skills/supabase/references/review.md"),
      read(".claude/skills/maps/SKILL.md"),
      read(".claude/skills/stripe/references/review.md"),
      read(".claude/skills/nextjs/references/review.md"),
    ].join("\n\n---\n\n");
    const tokenCounts = REVIEW_ENCODINGS.map((encoding) => encoding.encode(rendered).length);
    expect(Math.max(...tokenCounts)).toBeLessThanOrEqual(6000);
    const packageJson = JSON.parse(read("package.json")) as { devDependencies?: Record<string, string> };
    expect(packageJson.devDependencies?.["js-tiktoken"]).toBe("1.0.21");
    expect(routing).toContain("return 6000");
  });
});
