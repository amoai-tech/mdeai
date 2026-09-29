import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { CASES, CASES_BY_ID, REQUIRED_PROBE_ANCHORS } from "../pr-agent/evals/cases.mjs";
import { parseReviewSignals, scoreReview } from "../pr-agent/evals/score-review.mjs";
import { selectSkills } from "../select-pr-agent-skills.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = (name) => readFileSync(join(REPO_ROOT, "scripts/pr-agent/evals/fixtures", name), "utf8");

/** Recorded v0.45 production reviews, captured from the real PR comments. */
const RECORDED_BASELINES = {
  "semver-boundary": "pr-157-v045-recorded.md",
  "docs-only-control": "pr-158-v045-recorded.md",
};

/** Wrap evidence in the review envelope MDE's contract requires. */
const review = (evidence) =>
  [
    "## MDE PR Review",
    "",
    "**Key Issues**",
    "",
    evidence,
    "",
    "Severity: HIGH",
    "Status: changes_required",
    "Merge recommendation: Changes requested",
  ].join("\n");

/** Minimal evidence text that satisfies each defect case's required signals. */
const CATCHING_EVIDENCE = {
  "semver-boundary": [
    "The new EXACT_VERSION pattern accepts malformed versions. `01.2.3` passes because each core",
    "component uses \\d+ and permits a leading zero. `1.2.3-a..b` and `1.2.3+build.` also pass because",
    "the prerelease and build metadata classes allow empty dot-separated identifiers.",
  ].join("\n"),
  "supabase-rls-cross-tenant": [
    "This migration leaves a cross-tenant read path open: the table has RLS enabled but the policy",
    "predicate only checks auth.uid() IS NOT NULL, so User A can read User B's rows. Add an ownership",
    "predicate and a negative test proving User B's rows are denied to User A.",
  ].join("\n"),
  "stripe-webhook-replay": [
    "A replayed duplicate event fulfils twice because the handler has no idempotency key, so a",
    "duplicate ticket is issued. Events can also arrive out of order and re-apply an older status.",
    "Add a duplicate event test proving exactly one protected effect.",
  ].join("\n"),
  "ci-silent-success": [
    "The step runs `npm run floor || true`, which swallows the failing command's exit code and lets",
    "the job report success. pipefail is also missing, so the tee hides the non-zero status. Inject a",
    "deliberately failing step to prove the job must fail.",
  ].join("\n"),
  "retry-partial-write": [
    "Fulfilment writes the order row and then the ledger row with no transaction. A failure between",
    "the two writes leaves a partial write; a retry then duplicates the ledger row because there is no",
    "idempotency key. Wrap both writes in a single transaction or add an atomic RPC.",
  ].join("\n"),
};

const defectCases = CASES.filter((entry) => entry.kind === "defect");
const cleanCases = CASES.filter((entry) => entry.kind === "clean");

describe("SAN-1312 PR-Agent review-quality corpus", () => {
  it("declares a well-formed, uniquely identified corpus", () => {
    assert.equal(CASES.length, 6);
    assert.equal(new Set(CASES.map((entry) => entry.id)).size, CASES.length);
    assert.ok(defectCases.length >= 5, "at least five seeded-defect cases are required");
    assert.ok(cleanCases.length >= 1, "at least one clean control is required");
    for (const entry of CASES) {
      assert.ok(entry.summary.length > 10, `${entry.id} needs a summary`);
      assert.ok(Array.isArray(entry.changedFiles) && entry.changedFiles.length > 0, `${entry.id} needs changed files`);
      assert.ok(Array.isArray(entry.expectedOwnerSkills) && entry.expectedOwnerSkills.length > 0);
      for (const signal of entry.signals) {
        assert.ok(signal.name && Array.isArray(signal.any) && signal.any.length > 0, `${entry.id} signal is malformed`);
      }
    }
    for (const entry of defectCases) {
      assert.ok(entry.signals.length >= 3, `${entry.id} needs at least three required signals`);
      assert.ok(entry.minSignals >= 1 && entry.minSignals <= entry.signals.length);
    }
    for (const entry of cleanCases) {
      assert.equal(entry.signals.length, 0, `${entry.id} must not require any defect signal`);
    }
  });

  it("reproduces the recorded v0.45 false negative on PR #157", () => {
    const baseline = parseReviewSignals(fixture(RECORDED_BASELINES["semver-boundary"]));
    assert.equal(baseline.recommendation, "Safe to merge");
    assert.equal(baseline.score, 95);
    assert.equal(baseline.materialSeverity, false);
    assert.equal(baseline.materialFinding, false);

    const result = scoreReview(CASES_BY_ID["semver-boundary"], fixture(RECORDED_BASELINES["semver-boundary"]));
    assert.equal(result.detected, false, "the recorded v0.45 review must score as a miss — that is the defect this task closes");
  });

  it("does not read a risk label or the format contract as a material finding", () => {
    // A high risk assessment with no finding, and the reviewer's own severity enumeration,
    // must both stay non-material — neither is a finding.
    const riskOnly = parseReviewSignals("Risk level: High\n\n- Merge recommendation: Safe to merge");
    assert.equal(riskOnly.materialSeverity, false);
    assert.equal(riskOnly.materialFinding, false);

    const contractEcho = parseReviewSignals(
      "Structure issue_content with these sections:\nSeverity: BLOCKER | HIGH | MEDIUM | LOW\nProblem: ...",
    );
    assert.equal(contractEcho.materialSeverity, false);
    assert.equal(contractEcho.materialFinding, false);

    const realFinding = parseReviewSignals("Severity: HIGH\nStatus: changes_required");
    assert.equal(realFinding.materialSeverity, true);
    assert.equal(realFinding.materialFinding, true);

    // And the live PR #161 control review parses as non-material.
    const liveControl = parseReviewSignals(fixture(RECORDED_BASELINES["docs-only-control"]));
    assert.equal(liveControl.materialFinding, false);
  });

  it("requires the concrete malformed input before crediting a boundary finding", () => {
    const named = CASES_BY_ID["semver-boundary"];
    assert.deepEqual(named.mandatorySignals, ["cites a concrete malformed input"]);

    const vague = [
      "The new EXACT_VERSION pattern permits a leading zero in every core component, and the",
      "prerelease and build metadata classes accept empty dot-separated identifiers.",
    ].join("\n");
    const vagueResult = scoreReview(named, review(vague));
    assert.equal(
      vagueResult.detected,
      false,
      "a boundary finding that never names a failing input must not count as detection",
    );
    assert.ok(vagueResult.reasons.some((reason) => reason.includes("missing mandatory signal")));

    // The same review plus one concrete input is credited.
    const concrete = scoreReview(named, review(`${vague} For example 01.2.3 passes today.`));
    assert.equal(concrete.detected, true);
  });

  it("keeps the recorded v0.45 docs-only control clean", () => {
    const result = scoreReview(CASES_BY_ID["docs-only-control"], fixture(RECORDED_BASELINES["docs-only-control"]));
    assert.equal(result.falsePositive, false, "the recorded v0.45 review invented nothing on the clean control");
    assert.equal(result.signals.safeToMerge, true);
  });

  it("recognises a review that does catch each seeded defect", () => {
    for (const entry of defectCases) {
      const evidence = CATCHING_EVIDENCE[entry.id];
      assert.ok(evidence, `${entry.id} needs catching evidence in this test`);
      const result = scoreReview(entry, review(evidence));
      assert.equal(
        result.detected,
        true,
        `${entry.id} was not recognised as detected (matched ${result.matchedSignals.length}/${entry.minSignals}: ${result.reasons.join("; ")})`,
      );
    }
  });

  it("flags an invented material finding on the clean control", () => {
    const overAggressive = [
      "Merge recommendation: Changes requested",
      "Severity: HIGH",
      "BLOCKER: the AGENTS.md wording change might confuse a reader and should be reconsidered.",
      "Status: changes_required",
    ].join("\n");
    const result = scoreReview(CASES_BY_ID["docs-only-control"], overAggressive);
    assert.equal(result.falsePositive, true, "an invented BLOCKER on a docs-only control must be scored as a false positive");

    // And the controls stay differentiated: the same text cannot rescue the true defect case either.
    const safeOnDefect = scoreReview(CASES_BY_ID["semver-boundary"], "Merge recommendation: Safe to merge");
    assert.equal(safeOnDefect.detected, false, "a safe-to-merge verdict can never count as detection");
  });

  it("routes every case to the owner skill its findings require", () => {
    for (const entry of CASES) {
      const { skills, paths } = selectSkills(entry.changedFiles);
      for (const owner of entry.expectedOwnerSkills) {
        assert.ok(skills.includes(owner), `${entry.id} did not route to ${owner} (got ${skills.join(", ")})`);
      }
      assert.ok(paths.length === skills.length, `${entry.id} must select one path per skill`);
    }
  });

  it("keeps every required review probe anchored to its owning skill", () => {
    for (const anchor of REQUIRED_PROBE_ANCHORS) {
      const body = readFileSync(join(REPO_ROOT, anchor.skill), "utf8");
      assert.match(body, anchor.matches, `${anchor.skill} no longer documents: ${anchor.probe}`);
    }
    // The universal boundary probe must reach the reviewer on every PR, not only specialist ones.
    const universal = selectSkills(["README.md"]);
    assert.ok(
      universal.paths.includes("/github/workspace/.claude/skills/code-review/SKILL.md"),
      "the universal code-review skill must load on every review",
    );
  });
});
