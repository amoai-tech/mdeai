/**
 * The deploy-freshness gate must still fail a stuck pipeline, but two merges seconds apart
 * produce one READY deployment (the newer commit) and one inactive one (the older). Vercel
 * then never marks the older commit READY, so the old check reported a false failure on main.
 *
 * These tests run the real workflow shell against a fake Vercel/GitHub API.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

// Path is derived from this file's own URL, never from input.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); // nosemgrep
const workflow = YAML.parse(
  fs.readFileSync(path.join(root, ".github/workflows/prod-deploy-freshness.yml"), "utf8"), // nosemgrep
);
const gate = workflow.jobs.freshness.steps[0].run;

const FAKE_CURL = [
  "#!/usr/bin/env bash",
  'url=""',
  'for a in "$@"; do case "$a" in http*) url="$a";; esac; done',
  'case "$url" in',
  '  *"api.vercel.com"*"sha=TARGETS"*) printf \'{"deployments":[{"target":"production","source":"git","readyState":"%s","meta":{"githubCommitSha":"TARGETS"}}]}\\n200\' "$TARGET_STATE" ;;',
  '  *"api.vercel.com"*"sha=NEWER"*) printf \'{"deployments":[{"target":"production","source":"git","readyState":"%s","meta":{"githubCommitSha":"NEWER"}}]}\\n200\' "$NEWER_STATE" ;;',
  '  *"api.github.com"*"/commits/main"*) printf \'{"sha":"%s"}\' "$MAIN_SHA" ;;',
  '  *"api.github.com"*"/compare/"*) printf \'{"status":"%s","merge_base_commit":{"sha":"%s"},"head_commit":{"sha":"%s"}}\' "$COMPARE_STATUS" "$COMPARE_MERGE_BASE" "$MAIN_SHA" ;;',
  '  *) printf \'{"deployments":[]}\\n200\' ;;',
  "esac",
  "",
].join("\n");

// A zero window keeps the negative cases fast; the gate exits after its first full check.
function runGate({ targetState, newerState = "READY", mainSha = "NEWER", compareStatus = "ahead", compareMergeBase = "TARGETS", window = "0" }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "freshness-gate-"));
  const curl = path.join(dir, "curl");
  // "curl" lives in a directory this test just created with mkdtempSync; nothing from input
  // reaches the path. The fake binary is what lets us exercise the workflow shell offline.
  fs.writeFileSync(curl, FAKE_CURL); // nosemgrep
  fs.chmodSync(curl, 0o755); // nosemgrep
  const result = spawnSync("bash", ["-c", gate], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: dir + ":" + process.env.PATH,
      TARGET_SHA: "TARGETS",
      WINDOW_SECONDS: window,
      VERCEL_TOKEN: "test",
      VERCEL_PROJECT_ID: "test",
      VERCEL_ORG_ID: "test",
      GITHUB_TOKEN: "test",
      GITHUB_REPOSITORY: "amoai-tech/mdeai",
      TARGET_STATE: targetState,
      NEWER_STATE: newerState,
      MAIN_SHA: mainSha,
      COMPARE_STATUS: compareStatus,
      COMPARE_MERGE_BASE: compareMergeBase,
    },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test("passes when production serves the exact merge commit", () => {
  const result = runGate({ targetState: "READY" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /production is serving TARGETS/);
});

test("passes when a newer main commit that contains it is the one deployed", () => {
  const result = runGate({ targetState: "CANCELED", newerState: "READY" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /this run is superseded/);
});

test("does not accept a deployed commit on a diverged main branch", () => {
  const result = runGate({ targetState: "CANCELED", compareStatus: "diverged", compareMergeBase: "UNRELATED" });
  assert.equal(result.status, 1, "a deployed commit missing the original change must not pass freshness");
});

test("does not accept a deployed older commit after a branch rewind", () => {
  const result = runGate({ targetState: "CANCELED", compareStatus: "behind", compareMergeBase: "NEWER" });
  assert.equal(result.status, 1, "rewound main must not be treated as superseding this commit");
});

test("still fails when the newer commit is only building", () => {
  const result = runGate({ targetState: "CANCELED", newerState: "BUILDING" });
  assert.equal(result.status, 1, "a stuck pipeline must not be reported as fresh");
  assert.match(result.stderr + result.stdout, /Neither this commit nor a newer main commit is deployed/);
});

test("still fails when main has not moved and the deployment failed", () => {
  const result = runGate({ targetState: "CANCELED", mainSha: "TARGETS" });
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /Neither this commit nor a newer main commit is deployed/);
});
