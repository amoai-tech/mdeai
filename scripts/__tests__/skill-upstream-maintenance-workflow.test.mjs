import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const workflowPath = path.resolve(".github/workflows/skill-upstream-maintenance.yml");

function workflow() {
  return fs.readFileSync(workflowPath, "utf8");
}

/** The `on:` block, so trigger assertions cannot accidentally read another key. */
function triggerBlock(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith("on:"));
  assert.notEqual(start, -1, "workflow has no `on:` block");
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() && lines[i].search(/\S/) === 0) break;
    // Comments are prose, not configuration: this file explains *why* there are no
    // dispatch inputs, so matching raw text would flag the explanation itself.
    if (lines[i].trim().startsWith("#")) continue;
    body.push(lines[i]);
  }
  return body.join("\n");
}

test("runs on a weekly schedule and on manual dispatch", () => {
  const triggers = triggerBlock(workflow());
  assert.match(triggers, /schedule:/);
  assert.match(triggers, /cron:\s*"[^"]+"/);
  assert.match(triggers, /workflow_dispatch:/);
});

test("never runs on pull_request", () => {
  // A required check that depends on the public GitHub API would let someone
  // else's outage block every PR.
  assert.doesNotMatch(triggerBlock(workflow()), /pull_request/);
});

test("accepts no workflow_dispatch inputs", () => {
  // Operator-supplied inputs are a supply-chain surface (Checkov CKV_GHA_7).
  assert.doesNotMatch(triggerBlock(workflow()), /inputs:/);
});

test("keeps the job off pull requests and requests only read access", () => {
  const text = workflow();
  assert.match(text, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(text, /if:\s*github\.event_name\s*!=\s*'pull_request'/);
  assert.doesNotMatch(text, /write-all|contents:\s*write/);
});

test("verifies both local integrity and upstream drift, reporting both", () => {
  const text = workflow();
  assert.match(text, /python3 scripts\/check-skill-upstream\.py/);
  assert.match(text, /node scripts\/check-skill-upstream-drift\.mjs/);
  // An earlier Maps bug let a failing first step hide the second classification.
  assert.match(text, /if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/);
});

test("runs in strict drift mode so confirmed drift always fails", () => {
  assert.match(workflow(), /SKILL_DRIFT_MODE:\s*strict/);
});

test("pins every action to a full commit SHA", () => {
  const text = workflow();
  const uses = [...text.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0, "workflow declares no actions");
  for (const ref of uses) {
    assert.match(
      ref,
      /@[0-9a-f]{40}$/,
      `${ref} is not pinned to a commit SHA — a mutable tag can be repointed`,
    );
  }
});

test("uses the repository's own pinned checkout and setup-node commits", () => {
  const text = workflow();
  assert.match(text, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(text, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(text, /node-version-file:\s*\.nvmrc/);
});

test("does not leave the token in .git/config and cannot overlap itself", () => {
  const text = workflow();
  assert.match(text, /persist-credentials:\s*false/);
  assert.match(text, /^concurrency:/m);
  assert.match(text, /group:\s*skill-upstream-maintenance-/);
});
