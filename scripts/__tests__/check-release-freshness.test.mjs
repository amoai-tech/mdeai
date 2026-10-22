import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  claimMatches,
  classify,
  exitCodeFor,
  normalizeSha,
  parseArgs,
  readProductionSha,
  shortSha,
} from "../check-release-freshness.mjs";

const A = "9a204f1e87982a96c483800198962ea1e8d867a1";
const B = "6396dcee59fa7b64235772012dacea00a53f7b5d";

test("normalizeSha accepts only a full commit sha", () => {
  assert.equal(normalizeSha(A), A);
  assert.equal(normalizeSha(A.toUpperCase()), A);
  assert.equal(normalizeSha("9a204f1"), null);
  assert.equal(normalizeSha("not-a-sha"), null);
  assert.equal(normalizeSha(null), null);
});

test("shortSha prints a readable prefix", () => {
  assert.equal(shortSha(A), "9a204f1e8");
  assert.equal(shortSha(null), "unknown");
});

test("main and production agreeing is CURRENT", () => {
  assert.equal(classify({ main: A, production: A }), "CURRENT");
});

test("a newer main with an older production is DEPLOYMENT_PENDING, not a failure", () => {
  assert.equal(classify({ main: A, production: B, productionIsAncestor: true }), "DEPLOYMENT_PENDING");
  assert.equal(exitCodeFor("DEPLOYMENT_PENDING"), 0);
  assert.equal(exitCodeFor("DEPLOYMENT_PENDING", { strict: true }), 1);
});

test("a claim production does not serve is STALE_CLAIM", () => {
  assert.equal(classify({ main: A, production: A, claimed: B }), "STALE_CLAIM");
  assert.equal(exitCodeFor("STALE_CLAIM"), 1);
});

test("a claim that matches production is accepted", () => {
  assert.equal(classify({ main: A, production: A, claimed: A }), "CURRENT");
  assert.equal(classify({ main: A, production: B, claimed: B, productionIsAncestor: true }), "DEPLOYMENT_PENDING");
});

test("a differing production SHA is not called normal deployment lag without verified ancestry", () => {
  assert.equal(classify({ main: A, production: B }), "UNKNOWN");
  assert.equal(classify({ main: A, production: B, productionIsAncestor: false }), "UNKNOWN");
  assert.equal(classify({ main: A, production: B, productionIsAncestor: true }), "DEPLOYMENT_PENDING");
  assert.equal(exitCodeFor("UNKNOWN"), 1);
});

test("--claimed requires a valid SHA operand and fails before I/O", () => {
  for (const args of [["--claimed"], ["--claimed", ""], ["--claimed", "--json"], ["--claimed", "abc"]]) {
    assert.throws(() => parseArgs(args), /--claimed requires/);
  }
  assert.deepEqual(parseArgs(["--json", "--claimed", A.slice(0, 9), "--strict"]), {
    asJson: true, strict: true, claimed: A.slice(0, 9),
  });
  assert.equal(parseArgs([]).claimed, undefined);
});

test("unverifiable inputs are UNKNOWN and fail", () => {
  assert.equal(classify({ main: null, production: A }), "UNKNOWN");
  assert.equal(classify({ main: A, production: null }), "UNKNOWN");
  assert.equal(exitCodeFor("UNKNOWN"), 1);
});

test("a short claim matches only as a prefix of the served sha", () => {
  assert.equal(claimMatches("9a204f1", B), false);
  assert.equal(claimMatches("9a204f1", A), true);
  assert.equal(claimMatches(B, A), false);
});

test("the version payload must carry a real sha", () => {
  assert.equal(readProductionSha(JSON.stringify({ sha: A })), A);
  assert.throws(() => readProductionSha("<html>"), /did not return JSON/);
  assert.throws(() => readProductionSha("{}"), /no commit sha/);
  assert.throws(() => readProductionSha(JSON.stringify({ sha: "abc" })), /no commit sha/);
});

test("the CLI fails before any Git call when --claimed lacks a valid operand", () => {
  const script = fileURLToPath(new URL("../check-release-freshness.mjs", import.meta.url));
  for (const args of [["--claimed"], ["--claimed", "--strict"], ["--claimed", "invalid"]]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8", timeout: 3000, env: { ...process.env, PATH: "/nonexistent" },
    });
    assert.equal(result.status, 1, `exit status for ${args.join(" ")}`);
    assert.match(result.stderr, /--claimed requires a valid/);
    assert.doesNotMatch(result.stderr, /could not resolve origin\/main/);
  }
});