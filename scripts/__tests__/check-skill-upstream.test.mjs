import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const CHECKER = path.resolve("scripts/check-skill-upstream.py");
const REPO_ROOT = path.resolve(".");

const tempDirs = [];

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-upstream-"));
  tempDirs.push(dir);
  return dir;
}

function runChecker(root) {
  return spawnSync("python3", [CHECKER, "--root", root], { encoding: "utf8" });
}

/**
 * Write a canonical skill with an `upstream.yaml` and vendored files.
 *
 * `localKey` selects the manifest shape: `source.local` (one vendored tree) or
 * `sources.<name>.local` (several), because both exist in the real repository.
 */
function writeSkill(root, name, { vendored, localKey = "source.local", reviewedCommit = "abcdef1234567890abcdef1234567890abcdef12", includeIntegrity = false, extra = "" } = {}) {
  const skillDir = path.join(root, ".claude", "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when exercising the upstream checker.\n---\n\n# ${name}\n`,
  );

  for (const [rel, content] of Object.entries(vendored)) {
    const target = path.join(skillDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  const localLines = Object.keys(vendored)
    .map((rel) => {
      const dir = path.dirname(rel);
      return dir === "." ? rel : dir;
    })
    .filter((value, index, all) => all.indexOf(value) === index);

  const manifest = [
    `vendor: Test`,
    `repository: https://example.com/${name}`,
    `source_path: skills`,
    `reviewed_commit: ${reviewedCommit}`,
    `reviewed_at: 2026-09-28`,
    `policy:`,
    `  active_skill: ${name}`,
    `  upstream_files_are_read_only: true`,
    `  auto_update: false`,
    `  update_flow: detect-diff-review-evals-pin`,
    localKey === "source.local" ? `source:\n  local: ${localLines[0]}` : `sources:\n${localLines.map((l) => `  ${path.basename(l)}:\n    local: ${l}`).join("\n")}`,
  ];
  if (includeIntegrity) manifest.push(`local_integrity:`, `  trees:`);
  if (extra) manifest.push(extra);

  fs.writeFileSync(path.join(skillDir, "upstream.yaml"), `${manifest.join("\n")}\n`);
  return root;
}

/** Run the checker once to learn the correct hash, then record it. */
function adoptHashes(root, skill) {
  const result = runChecker(root);
  const suggestions = [...result.stdout.matchAll(/^\s+(\S+): ([0-9a-f]{64})$/gm)].map((m) => [m[1], m[2]]);
  assert.ok(suggestions.length > 0, `expected hash suggestions, got:\n${result.stdout}`);

  const manifestPath = path.join(root, ".claude", "skills", skill, "upstream.yaml");
  const text = fs.readFileSync(manifestPath, "utf8").replace(/local_integrity:\n  trees:\n/, "");
  const block = ["local_integrity:", "  trees:", ...suggestions.map(([p, h]) => `    ${p}: ${h}`)].join("\n");
  fs.writeFileSync(manifestPath, `${text.trimEnd()}\n${block}\n`);
  return root;
}

test("passes when every vendored tree matches its recorded hash", () => {
  const root = writeSkill(tmpRepo(), "alpha", { vendored: { "references/official/a/one.md": "# one\n" } });
  adoptHashes(root, "alpha");

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /SKILL_UPSTREAM_PASS trees=1/);
});

test("fails when a read-only vendored file is edited", () => {
  const root = writeSkill(tmpRepo(), "alpha", { vendored: { "references/official/a/one.md": "# one\n" } });
  adoptHashes(root, "alpha");
  fs.appendFileSync(path.join(root, ".claude/skills/alpha/references/official/a/one.md"), "\nhand edit\n");

  const result = runChecker(root);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /vendored files changed since they were reviewed/);
  assert.match(result.stdout, /upstream_files_are_read_only is true/);
});

test("fails and prints the value to record when no hash is recorded", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    vendored: { "references/official/a/one.md": "# one\n" },
    includeIntegrity: true,
  });

  const result = runChecker(root);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /no recorded hash for references\/official\/a/);
  assert.match(result.stdout, /add under local_integrity\.trees/);
});

test("fails when reviewed_commit is missing", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    vendored: { "references/official/a/one.md": "# one\n" },
    reviewedCommit: "",
  });
  adoptHashes(root, "alpha");

  const result = runChecker(root);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /missing reviewed_commit/);
});

test("fails when the vendored path does not exist", () => {
  const root = writeSkill(tmpRepo(), "alpha", { vendored: {} });
  const manifestPath = path.join(root, ".claude/skills/alpha/upstream.yaml");
  fs.writeFileSync(manifestPath, `${fs.readFileSync(manifestPath, "utf8")}local_integrity:\n  trees:\n`);

  const result = runChecker(root);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /no vendored local directory declared|vendored path does not exist/);
});

test("reads the prefixed source.local form and the multi-source form", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    vendored: { "references/official/a/one.md": "# one\n", "references/official/b/two.md": "# two\n" },
    localKey: "sources",
  });
  adoptHashes(root, "alpha");

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /SKILL_UPSTREAM_PASS trees=2/);
});

test("hashes a vendored file as a one-entry tree", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    vendored: { "references/official/one/SKILL.md": "# vendored file\n" },
  });
  adoptHashes(root, "alpha");

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /trees=1/);
});

test("the committed repository passes", () => {
  const result = runChecker(REPO_ROOT);
  assert.equal(
    result.status,
    0,
    `vendored skill integrity check failed:\n${result.stdout}${result.stderr}`,
  );
  assert.match(result.stdout, /SKILL_UPSTREAM_PASS trees=\d+/);
});
