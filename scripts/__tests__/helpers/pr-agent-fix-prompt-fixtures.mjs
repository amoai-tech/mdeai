// SAN-1552 · Shared fixtures for the fix-prompt tests.
//
// These builders mirror the recorded PR-Agent v0.45/v0.46 persistent state schema. They are test
// scaffolding only: no network, no model, no GitHub client.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderFixPrompt } from "../../pr-agent/render-fix-prompt.mjs";
import { reviewEnvelope } from "../../pr-agent/review-policy.mjs";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const BASE = "c14348231b0fe2d1094a6dfb5fbb09d7911373bc";
export const HEAD = "d6cdf9e3c4547b662ba9101f6077be48aacb243e";
export const OTHER_HEAD = "9af17edce9b8143d824450eb08bfdac5266e9406";
export const PR_URL = "https://github.com/amoai-tech/mdeai/pull/1552";

export const recordedCanaryFixture = () =>
  readFileSync(
    join(REPO_ROOT, "scripts/pr-agent/evals/fixtures/pr-163-canary-v045-recorded.md"),
    "utf8",
  );

/** The PR-Agent v0.46 recorded review whose state bodies carry no Severity/Status labels. */
export const recordedFormatFixture = () =>
  readFileSync(
    join(REPO_ROOT, "scripts/pr-agent/evals/fixtures/pr-274-readable-format-postmerge-recorded.md"),
    "utf8",
  );

/** A synthetic unified diff whose lines startLine..endLine are added on the RIGHT side. */
export function patchWithAdded(startLine, endLine = startLine, { before = 2, after = 2 } = {}) {
  const from = Math.max(1, startLine - before);
  const contextBefore = startLine - from;
  const added = endLine - startLine + 1;
  const lines = [
    `@@ -${from},${contextBefore + after} +${from},${contextBefore + added + after} @@`,
  ];
  for (let line = from; line < startLine; line += 1) lines.push(` context line ${line}`);
  for (let line = startLine; line <= endLine; line += 1) lines.push(`+changed line ${line}`);
  for (let line = endLine + 1; line <= endLine + after; line += 1) lines.push(` context line ${line}`);
  return lines.join("\n");
}

export function changedFile(filename, startLine, endLine = startLine, extra = {}) {
  return { filename, status: "modified", patch: patchWithAdded(startLine, endLine), ...extra };
}

/** One finding body in the eight-field form MDE's review contract requires. */
export function findingBody({
  severity = "HIGH",
  status = "changes_required",
  verification = "VERIFIED",
  problem = "A concrete defect was observed.",
  impact = "A real user or CI consequence follows.",
  fix = "Apply the smallest safe correction.",
  test = "Add a focused regression and run it.",
} = {}) {
  return [
    `Severity: ${severity}`,
    `Problem: ${problem}`,
    `Impact: ${impact}`,
    `Fix: ${fix}`,
    `Test: ${test}`,
    `Verification state: ${verification}`,
    `Status: ${status}`,
  ].join("\n");
}

export function stateFinding({
  id = "f1",
  path = "src/app.ts",
  lineStart = 10,
  lineEnd = lineStart,
  state = "ACTIVE",
  lastSeenHeadSha = HEAD,
  ...body
} = {}) {
  return {
    body: findingBody(body),
    finding_id: id,
    first_seen: "2026-10-19T00:00:00.000Z",
    last_seen: "2026-10-19T00:00:00.000Z",
    last_seen_head_sha: lastSeenHeadSha,
    line_start: lineStart,
    line_end: lineEnd,
    path,
    state,
  };
}

/** A verified review result whose body is a real ReviewEnvelope plus real persistent state. */
export function stateReview({
  findings = [],
  headSha = HEAD,
  baseSha = BASE,
  coverage = {},
  type = "canonical",
  command = "/review",
  stateBody = null,
} = {}) {
  const { kind = "full", complete = true, excludedFiles = [] } = coverage;
  const state =
    stateBody ??
    JSON.stringify({
      findings,
      last_run: { complete, excluded_files: excludedFiles, head_sha: headSha, kind },
      schema_version: 1,
    });
  const body = [
    reviewEnvelope({ baseSha, headSha, command, type }),
    "## MDE PR Review",
    "<!-- pr-agent:review:full -->",
    "",
    "<!-- pr-agent-review-state:v1",
    state,
    "-->",
    "",
  ].join("\n");
  return {
    ok: true,
    code: "OK",
    coverageConfirmed: type === "canonical",
    type,
    comment: {
      id: 101,
      body,
      user: { login: "github-actions[bot]" },
      created_at: "2026-10-19T00:00:00Z",
      updated_at: "2026-10-19T00:00:00Z",
    },
  };
}

export const render = (result, changedFiles, overrides = {}) =>
  renderFixPrompt({
    result,
    baseSha: BASE,
    headSha: HEAD,
    prUrl: PR_URL,
    changedFiles,
    ...overrides,
  });
