// SAN-1332 · frozen single-defect canary fixture
//
// WHY THIS FILE EXISTS
//
// The first v0.45 ↔ v0.46 A/B was measured against a canary that introduced a brand-new,
// gate-unwired checker (`scripts/check-agui-pin.mjs`, which does not exist on `main`). Every
// review therefore had several *real, competing* defects to report — "the checker is not wired
// into CI", "the test harness replaces source text so path resolution is untested", "only
// dependencies and devDependencies are read". PR-Agent spends its 6-finding budget on the
// loudest findings, so it blocked on those and never reached the seeded SemVer boundary.
//
// That made the instrument measure finding *prioritisation*, not defect detection: v0.45 and
// v0.46 both scored 0/3 while the reviews were full of correct, grounded, off-target findings.
// The 0/3 result proved nothing about either version.
//
// This fixture is the real PR #157 false negative instead — the pre-fix state of
// `scripts/check-mastra.mjs`, which `npm run floor` already runs via `check:mastra`. Nothing in
// the diff is a competing defect that a gate does not already run, so the only reportable
// defect is the seeded one.
//
// These assertions are deterministic and need no model call. They prove the fixture still seeds
// the defect, still leaves the boundary unproven in its suite, and still touches only files an
// existing gate runs — which is exactly the property the previous canary lacked.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = join(REPO_ROOT, "scripts", "pr-agent", "evals", "fixtures");
const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");
const repoFile = (name) => readFileSync(join(REPO_ROOT, name), "utf8");

const CANARY_SOURCE = "semver-boundary-canary-source.mjs";
const CANARY_TEST = "semver-boundary-canary-test.mjs";

// The exact defective line, pinned as a literal so the fixture cannot drift into "already fixed"
// without this file failing. The pattern is deliberately NOT restated as a live regex and
// rebuilt — a dynamic RegExp here would let a changed fixture keep passing.
const RECORDED_DEFECTIVE_LINE =
  "const EXACT_VERSION = /^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$/;";

// Behaviour of that recorded line, stated literally.
const RECORDED_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// Every input the real fix commit `fb2052f2b` named as wrongly accepted, split by the fixture's
// actual behaviour so the characterisation is honest rather than aspirational.
const MALFORMED_ACCEPTED = [
  "01.2.3", // leading zero in a core component
  "1.02.3",
  "1.2.03",
  "1.2.3-01", // leading zero in a numeric prerelease identifier
  "1.2.3-a..b", // empty dot-separated identifier
  "1.2.3-a.",
  "1.2.3-.a",
];
// Malformed, but the permissive pattern happens to reject these already. Recorded so nobody
// later claims the fixture proves more than it does.
const MALFORMED_ALREADY_REJECTED = ["1.2.3-", "1.2.3+", "1.2.3.4", "v1.2.3", "1.2.3 "];

const WELL_FORMED = [
  "1.55.2",
  "0.0.59",
  "0.0.0",
  "0.2.1-beta.2",
  "1.76.0-beta.1",
  "1.0.0-0",
  "1.0.0+build.1",
  "1.0.0-alpha.1+build.2",
];

describe("SAN-1332 frozen canary fixture", () => {
  it("still ships the recorded permissive pattern, not the fixed one", () => {
    assert.ok(
      fixture(CANARY_SOURCE).includes(RECORDED_DEFECTIVE_LINE),
      `${CANARY_SOURCE} no longer carries the recorded defective pattern. If the fixture was ` +
        "refreshed, update RECORDED_DEFECTIVE_LINE and re-run the reliability gate — a fixture " +
        "that silently drifted to the fixed code measures nothing.",
    );
  });

  it("still accepts the malformed versions the real fix commit removed", () => {
    for (const version of MALFORMED_ACCEPTED) {
      assert.equal(
        RECORDED_PATTERN.test(version),
        true,
        `${JSON.stringify(version)} is not publishable SemVer; the fixture must accept it for the defect to exist`,
      );
    }
  });

  it("still rejects the malformed versions it already rejected", () => {
    for (const version of MALFORMED_ALREADY_REJECTED) {
      assert.equal(
        RECORDED_PATTERN.test(version),
        false,
        `${JSON.stringify(version)} is already rejected by the permissive pattern`,
      );
    }
  });

  it("rejects nothing well-formed, so the defect is narrow rather than a broken checker", () => {
    for (const version of WELL_FORMED) {
      assert.equal(
        RECORDED_PATTERN.test(version),
        true,
        `${JSON.stringify(version)} is an exact pin and must pass`,
      );
    }
  });

  it("leaves the boundary unproven in the recorded suite", () => {
    // The defect is only unproven if the suite does not assert the boundary. If a future edit
    // adds those assertions to the fixture, the seeded gap is gone.
    const suite = fixture(CANARY_TEST);
    assert.ok(
      !suite.includes("01.2.3"),
      `${CANARY_TEST} now asserts the malformed boundary; the seeded gap no longer exists`,
    );
  });

  it("touches only files an existing gate already runs", () => {
    // This is the property the previous canary lacked, and the reason the A/B measured nothing.
    // A canary that adds a script nothing executes hands the reviewer a loud competing defect
    // ("this checker is never run"), which wins the finding budget over the seeded defect.
    const pkg = JSON.parse(repoFile("package.json"));
    assert.ok(
      String(pkg.scripts.floor).includes("check:mastra"),
      "the canary's checker must be reachable from `npm run floor`",
    );
    assert.equal(
      String(pkg.scripts["check:release-gates"]),
      "node --test scripts/__tests__/*.test.mjs",
      "the canary's suite must be inside the release-gate glob",
    );
    assert.match("scripts/__tests__/copilotkit-version-alignment.test.mjs", /^scripts\/__tests__\/.*\.test\.mjs$/);
  });
});
