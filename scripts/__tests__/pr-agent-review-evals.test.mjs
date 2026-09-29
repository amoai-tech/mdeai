// SAN-1312 · MDE-PR-REVIEW-001
//
// Scope, stated plainly so nobody mistakes this for behavioural certification:
//
//   THIS FILE PROVES   the scorer, the corpus contract, the finding extraction, the router wiring,
//                      and that the recorded model outputs still score as they did.
//   THIS FILE DOES NOT PROVE   that PR-Agent finds anything. Every "catching" review below is
//                      synthetic wording written by this test. Behavioural certification needs a
//                      real model run captured from a canary PR — see the captured fixtures and
//                      `scripts/pr-agent/evals/README.md`.
//
// The synthetic cases are still worth gating: they are cheap, deterministic, and they fail loudly
// if the scorer is loosened back into a whole-body word match that a fake PASS could satisfy.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { CASES, CASES_BY_ID, REQUIRED_PROBE_ANCHORS } from "../pr-agent/evals/cases.mjs";
import {
  checkGrounding,
  isMaterialFinding,
  matchCase,
  parseFindings,
  parseReviewSignals,
  scoreReview,
} from "../pr-agent/evals/score-review.mjs";
import { selectSkills } from "../select-pr-agent-skills.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = (name) => readFileSync(join(REPO_ROOT, "scripts/pr-agent/evals/fixtures", name), "utf8");

/**
 * Recorded production reviews, captured verbatim from the real PR comments — each file is the
 * comment body byte-for-byte, so a fixture can be re-verified with `gh api`.
 *   pr-157-v045-recorded.md        <- issue comment 5886176567
 *   pr-158-v045-recorded.md        <- issue comment 5886206854
 *   pr-163-canary-v045-recorded.md <- issue comment 5887740888
 * `pr-163` is a real model-generated review of a seeded defect — not synthetic wording.
 */
const RECORDED = {
  "semver-boundary": "pr-157-v045-recorded.md",
  "docs-only-control": "pr-158-v045-recorded.md",
};

const canaryRecorded = fixture("pr-163-canary-v045-recorded.md");
const CANARY_HEAD = "283412878f08ed370fb91e8cab58b463962c2059";

/** Build one finding in the structure MDE's review contract requires. */
const finding = (evidence, { severity = "HIGH", status = "changes_required" } = {}) =>
  [`Severity: ${severity}`, "Problem: a defect the reviewer asserts", evidence, `Status: ${status}`].join("\n");

const review = (...findings) =>
  ["## MDE PR Review", ...findings, "", "Merge recommendation: Changes requested"].join("\n\n");

/** Evidence text that satisfies each defect case's contract, scoped to one finding. */
const CATCHING_EVIDENCE = {
  "semver-boundary": [
    "The new EXACT_VERSION pattern accepts malformed versions. `01.2.3` passes because each core",
    "component permits a leading zero, and `1.2.3-alpha..1` passes because the prerelease class",
    "allows empty dot-separated identifiers.",
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
      assert.ok(entry.signals.length >= 2, `${entry.id} needs at least two required signals`);
      assert.ok(entry.minSignals >= 1 && entry.minSignals <= entry.signals.length);
      for (const name of entry.mandatorySignals ?? []) {
        assert.ok(
          entry.signals.some((signal) => signal.name === name),
          `${entry.id} mandatory signal "${name}" is not one of its declared signals`,
        );
      }
    }
    for (const entry of cleanCases) {
      assert.equal(entry.signals.length, 0, `${entry.id} must not require any defect signal`);
    }
  });

  it("requires literal malformed examples in the semver case", () => {
    const named = CASES_BY_ID["semver-boundary"];
    assert.ok(named.requiredExamples.includes("01.2.3"));
    assert.ok(named.requiredExamples.includes("1.2.3-alpha..1"));
    assert.ok(named.requiredExamples.includes("1.2.3+build."));
    // A pattern that can be satisfied by ordinary prose must not be used as example evidence.
    for (const entry of CASES) {
      for (const signal of entry.signals) {
        for (const pattern of signal.any) {
          assert.notEqual(pattern.source, "\\.\\s*$", `${entry.id} must not use a sentence-final-period matcher`);
        }
      }
    }
  });
});

describe("SAN-1312 finding-level extraction", () => {
  it("parses the persistent finding state of a real captured review", () => {
    const parsed = parseFindings(canaryRecorded);
    assert.equal(parsed.source, "state");
    assert.equal(parsed.stateParsed, true);
    assert.equal(parsed.runComplete, true);
    assert.equal(parsed.runHeadSha, "283412878f08ed370fb91e8cab58b463962c2059");
    assert.equal(parsed.findings.length, 2);
    for (const entry of parsed.findings) {
      assert.equal(entry.state, "ACTIVE");
      // The model returned prose, not the Severity/Evidence/Status structure the config requires.
      assert.equal(entry.severity, null);
      assert.equal(entry.status, null);
      assert.equal(entry.hasEvidence, false);
      assert.equal(entry.hasFailureScenario, false);
    }
  });

  it("does not invent findings for a review with none", () => {
    for (const path of Object.values(RECORDED)) {
      const parsed = parseFindings(fixture(path));
      assert.equal(parsed.findings.length, 0, `${path} must parse as zero findings`);
    }
  });

  it("reads severity and status only from within a finding", () => {
    const labelled = parseFindings("Severity: HIGH\nStatus: changes_required\nProblem: x");
    assert.equal(labelled.findings.length, 1);
    assert.equal(labelled.findings[0].severity, "HIGH");
    assert.equal(labelled.findings[0].status, "changes_required");
    assert.equal(isMaterialFinding(labelled.findings[0]), true);

    const advisory = parseFindings("Severity: LOW\nStatus: advisory\nProblem: nit");
    assert.equal(isMaterialFinding(advisory.findings[0]), false);

    const resolved = parseFindings(
      '<!-- pr-agent-review-state:v1\n{"findings":[{"body":"Severity: HIGH","state":"RESOLVED"}],"last_run":{"complete":true}}\n-->',
    );
    assert.equal(isMaterialFinding(resolved.findings[0]), false, "a resolved finding is not material");
  });
});

describe("SAN-1312 recorded baselines", () => {
  it("reproduces the recorded v0.45 false negative on PR #157", () => {
    const signals = parseReviewSignals(fixture(RECORDED["semver-boundary"]));
    assert.equal(signals.recommendation, "Safe to merge");
    assert.equal(signals.score, 95);

    const result = scoreReview(CASES_BY_ID["semver-boundary"], fixture(RECORDED["semver-boundary"]));
    assert.equal(result.findingCount, 0);
    assert.equal(result.detected, false, "the recorded v0.45 review must score as a miss — that is the defect this task closes");
  });

  it("keeps the recorded v0.45 docs-only control clean", () => {
    const result = scoreReview(CASES_BY_ID["docs-only-control"], fixture(RECORDED["docs-only-control"]));
    assert.equal(result.falsePositive, false);
    assert.equal(result.signals.safeToMerge, true);
  });

  it("scores the real captured canary review as a miss despite its blocking verdict", () => {
    const result = scoreReview(CASES_BY_ID["semver-boundary"], canaryRecorded);
    assert.equal(result.findingCount, 2, "the canary review asserted two findings");
    assert.equal(result.blockingVerdict, true, "it recommended changes");
    assert.equal(result.detected, false, "neither finding identified the real boundary defect");
    // Neither finding is labelled, so nothing may be claimed as material.
    assert.deepEqual(result.materialFindings, []);
    assert.equal(result.runHeadSha, "283412878f08ed370fb91e8cab58b463962c2059");
  });
});

describe("SAN-1312 scoring invariants", () => {
  it("never treats an overall risk level as a finding severity", () => {
    const riskOnly = [
      "## MDE PR Review",
      "Risk level: High",
      "No material defects found",
      "Merge recommendation: Safe to merge",
    ].join("\n");

    assert.equal(parseFindings(riskOnly).findings.length, 0);
    assert.equal(parseReviewSignals(riskOnly).risk, "High");
    assert.equal(scoreReview(CASES_BY_ID["docs-only-control"], riskOnly).falsePositive, false);
    assert.equal(scoreReview(CASES_BY_ID["semver-boundary"], riskOnly).detected, false);
  });

  it("does not treat a conservative merge recommendation as an invented finding", () => {
    const conservative = [
      "## MDE PR Review",
      "No material findings.",
      "Merge recommendation: Merge with caution — tests are still running",
    ].join("\n");
    const result = scoreReview(CASES_BY_ID["docs-only-control"], conservative);
    assert.equal(result.findingCount, 0);
    assert.equal(result.signals.safeToMerge, false, "the recommendation is not an unqualified merge");
    assert.equal(result.falsePositive, false, "a conservative recommendation is not an invented defect");
  });

  it("counts only a material finding as a clean-control false positive", () => {
    const nonMaterial = review(
      "<details><summary><strong>Consider renaming the helper</strong></summary>\nMinor naming nit only.\n</details>",
    )
      .replace("Severity: HIGH\n\nProblem: a defect the reviewer asserts\n\n", "")
      .replace("Merge recommendation: Changes requested", "Merge recommendation: Safe to merge");
    assert.equal(parseFindings(nonMaterial).findings.length, 1);
    assert.equal(scoreReview(CASES_BY_ID["docs-only-control"], nonMaterial).falsePositive, false);

    const invented = review(finding("BLOCKER: the docs wording might confuse a reader."));
    const inventedResult = scoreReview(CASES_BY_ID["docs-only-control"], invented);
    assert.equal(inventedResult.falsePositive, true);
    assert.equal(inventedResult.materialFindings.length, 1);
  });

  it("credits a defect only when one finding carries the whole contract", () => {
    const named = CASES_BY_ID["semver-boundary"];

    // Evidence split across two findings must not add up to a PASS.
    const split = review(
      finding("The EXACT_VERSION gate is documented as an exact-version pin for dependencies."),
      finding("A malformed version such as 01.2.3 passes the current pattern because of a leading zero."),
    );
    const splitResult = scoreReview(named, split);
    assert.equal(splitResult.findingCount, 2);
    assert.equal(splitResult.detected, false, "validator name and example in different findings must not be credited");

    // One finding carrying everything is credited.
    const together = scoreReview(named, review(finding(CATCHING_EVIDENCE["semver-boundary"])));
    assert.equal(together.detected, true);
    assert.equal(together.citedExamples.includes("01.2.3"), true);
    assert.equal(together.detectionQuality, "labelled");
  });

  it("requires a literal malformed example, not just boundary prose", () => {
    const named = CASES_BY_ID["semver-boundary"];
    const vague = review(
      finding(
        "The new EXACT_VERSION pattern permits a leading zero in every core component, and the prerelease and build metadata classes accept empty dot-separated identifiers.",
      ),
    );
    const vagueResult = scoreReview(named, vague);
    assert.equal(vagueResult.detected, false);
    assert.ok(vagueResult.reasons.some((reason) => reason.includes("no literal malformed example cited")));

    const cited = scoreReview(named, review(finding(`${CATCHING_EVIDENCE["semver-boundary"]} For example 01.2.3 passes today.`)));
    assert.equal(cited.detected, true);
  });

  it("does not credit a finding that is not blocking", () => {
    const named = CASES_BY_ID["semver-boundary"];
    const advisory = review(finding(CATCHING_EVIDENCE["semver-boundary"], { severity: "LOW", status: "advisory" }))
      .replace("Merge recommendation: Changes requested", "Merge recommendation: Safe to merge");
    const result = scoreReview(named, advisory);
    assert.equal(result.detected, false, "a safe-to-merge verdict can never count as detection");
  });

  it("does not let one finding borrow another finding's blocking verdict", () => {
    const named = CASES_BY_ID["semver-boundary"];
    const borrowed = [
      "## MDE PR Review",
      finding("An unrelated authentication finding.", { severity: "HIGH", status: "changes_required" }),
      // Carries the whole case contract, but labels itself nothing and the review does not block.
      "<details><summary><strong>Version boundary</strong></summary>\nThe EXACT_VERSION pattern accepts 01.2.3 because of a leading zero, and 1.2.3-alpha..1 because the prerelease class allows empty identifiers.\n</details>",
      "Merge recommendation: Safe to merge",
    ].join("\n\n");

    const result = scoreReview(named, borrowed);
    assert.equal(result.findingCount, 2);
    assert.equal(result.blockingVerdict, true, "another finding did assert changes_required");
    assert.equal(
      result.detected,
      false,
      "the credited finding must block on its own verdict, not borrow an unrelated finding's",
    );
  });

  it("never credits detection when the review recommends an unqualified merge", () => {
    const named = CASES_BY_ID["semver-boundary"];
    const contradictory = review(finding(CATCHING_EVIDENCE["semver-boundary"])).replace(
      "Merge recommendation: Changes requested",
      "Merge recommendation: Safe to merge",
    );
    assert.equal(scoreReview(named, contradictory).detected, false);
  });

  it("matches one finding against each case contract", () => {
    for (const entry of defectCases) {
      const parsed = parseFindings(review(finding(CATCHING_EVIDENCE[entry.id])));
      assert.equal(parsed.findings.length, 1, `${entry.id} evidence must parse as one finding`);
      const match = matchCase(entry, parsed.findings[0]);
      assert.equal(
        match.credits,
        true,
        `${entry.id} evidence did not satisfy its own contract (matched ${match.matchedSignals.length}/${entry.minSignals}: ${match.matchedSignals.join(", ")})`,
      );
    }
  });

  it("recognises a review that does catch each seeded defect", () => {
    for (const entry of defectCases) {
      const result = scoreReview(entry, review(finding(CATCHING_EVIDENCE[entry.id])));
      assert.equal(
        result.detected,
        true,
        `${entry.id} was not recognised as detected (${result.reasons.join("; ")})`,
      );
    }
  });
});

describe("SAN-1312 finding grounding (golden requirement)", () => {
  const canarySource = fixture("pr-163-canary-source.mjs");

  it("shows the canary review quoted code the reviewed file does not contain", () => {
    const parsed = parseFindings(canaryRecorded);
    const regexFinding = parsed.findings.find((entry) => entry.body.includes("\\d+\\.\\d+\\d+"));
    assert.ok(regexFinding, "the canary review must contain the misquoted regex finding");

    const grounding = checkGrounding(regexFinding, canarySource);
    assert.equal(grounding.grounded, false, "the quoted regex is not in the reviewed source");
    assert.ok(
      grounding.ungrounded.some((fragment) => fragment.includes("\\d+\\.\\d+\\d+")),
      `expected the misquoted pattern among ${JSON.stringify(grounding.ungrounded)}`,
    );

    // The real pattern in the file IS present, so the check is not a blanket failure.
    const real = "/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$/";
    assert.equal(canarySource.includes(real), true, "the real regex must appear in the fixture source");
    assert.equal(
      checkGrounding({ body: `The pattern is \`${real}\` today.` }, canarySource).grounded,
      true,
    );
  });

  it("reports a proposed fix as ungrounded without auto-failing it", () => {
    const proposed = checkGrounding(
      { body: "Replace it with `/^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)$/` instead." },
      canarySource,
    );
    // A suggested replacement is correctly absent from the source; this is a diagnostic signal
    // asking a human to verify which quote is the claim and which is the fix.
    assert.equal(proposed.grounded, false);
    assert.match(proposed.reason, /verify before crediting/);
  });

  it("reports grounding for every finding, including when nothing is credited", () => {
    const sourceText = readFileSync(join(REPO_ROOT, "scripts/check-mastra.mjs"), "utf8");

    const caught = scoreReview(CASES_BY_ID["semver-boundary"], review(finding(CATCHING_EVIDENCE["semver-boundary"])), {
      sourceText,
    });
    assert.equal(caught.detected, true);
    assert.deepEqual(caught.grounding, [], "no code quotes, so nothing to report");

    // The canary case: nothing is credited, yet the hallucinated quote must still be surfaced.
    const canary = scoreReview(CASES_BY_ID["semver-boundary"], canaryRecorded, { sourceText: canarySource });
    assert.equal(canary.detected, false);
    const ungrounded = canary.grounding.filter((entry) => entry.grounded === false);
    assert.equal(ungrounded.length, 1, "the misquoted regex must be reported as ungrounded");
    assert.ok(ungrounded[0].finding.length > 0, "the ungrounded report names the finding");
  });
});

describe("SAN-1312 corpus wiring", () => {
  it("routes every case to the owner skill its findings require", () => {
    for (const entry of CASES) {
      const { skills, paths } = selectSkills(entry.changedFiles);
      for (const owner of entry.expectedOwnerSkills) {
        assert.ok(skills.includes(owner), `${entry.id} did not route to ${owner} (got ${skills.join(", ")})`);
      }
      assert.equal(paths.length, skills.length, `${entry.id} must select one path per skill`);
    }
  });

  it("keeps every required review probe anchored to its owning skill", () => {
    for (const anchor of REQUIRED_PROBE_ANCHORS) {
      const body = readFileSync(join(REPO_ROOT, anchor.skill), "utf8");
      assert.match(body, anchor.matches, `${anchor.skill} no longer documents: ${anchor.probe}`);
    }
    const universal = selectSkills(["README.md"]);
    assert.ok(
      universal.paths.includes("/github/workspace/.claude/skills/code-review/SKILL.md"),
      "the universal code-review skill must load on every review",
    );
  });
});

describe("SAN-1312 exact-head capture", () => {
  it("records the head the canary review's own state advanced to", () => {
    // The replay procedure pins the exact head with this field; if a future recapture drops it,
    // capture-review.mjs refuses instead of scoring an unconfirmed review.
    assert.equal(parseFindings(canaryRecorded).runHeadSha, CANARY_HEAD);
  });

  it("accepts that a clean review carries no head record, so a clean control is boundary-pinned", () => {
    // Load-bearing limitation, verified against the recorded production reviews: a review with
    // findings persists its state (and therefore its head); a clean review persists nothing, so it
    // can only be captured with --allow-unconfirmed-head and must be reported as unconfirmed.
    for (const name of Object.values(RECORDED)) {
      assert.equal(
        parseFindings(fixture(name)).runHeadSha,
        null,
        `${name} unexpectedly records a head — the documented clean-review limitation changed`,
      );
    }
  });

  it("fails with an actionable message when the GitHub CLI is unavailable", () => {
    const script = join(REPO_ROOT, "scripts/pr-agent/evals/capture-review.mjs");
    const result = spawnSync(process.execPath, [script, "--pr", "1"], {
      encoding: "utf8",
      env: { ...process.env, PATH: "/nonexistent-path-for-gh-lookup" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GitHub CLI \(`gh`\) is not installed or not on PATH/);
    assert.match(result.stderr, /gh auth login/);
  });
});
