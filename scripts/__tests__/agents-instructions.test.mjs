import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");
const agents = read("AGENTS.md");
const qaGuide = read("docs/06-testing/1password-qa-agent-guide.md");
const browser = read("scripts/qa-browser.ts");
const scripts = JSON.parse(read("package.json")).scripts;

test("agent instructions resolve the existing intent, spec and plan templates", () => {
  const paths = [
    "docs/07-operations/intent-spec-plan/README.md",
    "docs/07-operations/intent-spec-plan/templates/intent.md",
    "docs/07-operations/intent-spec-plan/templates/spec.md",
    "docs/07-operations/intent-spec-plan/templates/plan.md",
  ];
  for (const path of paths) {
    assert.ok(existsSync(resolve(repoRoot, path)), `missing template/guide: ${path}`);
    assert.ok(agents.includes(`(${path})`), `AGENTS.md must link ${path}`);
  }
  assert.match(read("CLAUDE.md"), /@AGENTS\.md/);
});

test("agent QA commands exist and reuse the tracked fixtures and guide", () => {
  for (const name of [
    "qa:auth:check",
    "qa:browser",
    "qa:test:admin",
    "dev:ui:worktree",
  ]) {
    assert.ok(scripts[name], `missing npm script: ${name}`);
  }
  for (const path of [
    "e2e/fixtures.ts",
    "e2e/helpers/auth.ts",
    "e2e/README.md",
    "docs/06-testing/1password-qa-agent-guide.md",
  ]) {
    assert.ok(existsSync(resolve(repoRoot, path)), `missing QA dependency: ${path}`);
  }
  assert.match(agents, /\(docs\/06-testing\/1password-qa-agent-guide\.md\)/);
});

test("agent QA ports, origins and cleanup match the real launcher", () => {
  assert.match(browser, /const DEFAULT_PORT = 9227;/);
  assert.match(browser, /const LIVE_HOSTS = new Set\(\["www\.mdeai\.co", "mdeai\.co"\]\)/);
  assert.match(agents, /--port=9255/);
  assert.match(qaGuide, /--port=9255/);
  assert.match(agents, /--allow-remote/);
  assert.match(agents, /--origin=https:\/\/www\.mdeai\.co/);
  assert.match(browser, /new URL\("\/saved", options\.origin\)/);
});

test("required CI gate identifiers remain referenced in the agent instructions", () => {
  assert.match(agents, /\bmastra-schema-init\b/);
  assert.match(agents, /\bfloor\b/);
});
