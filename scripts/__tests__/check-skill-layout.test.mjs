import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const CHECKER = path.resolve("scripts/check-skill-layout.py");
const REPO_ROOT = path.resolve(".");

const tempDirs = [];

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Build an isolated repository-shaped fixture so the checker can run without deps. */
function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-layout-"));
  tempDirs.push(dir);
  return dir;
}

function skillBody(name) {
  return `---\nname: ${name}\ndescription: Use when exercising the layout checker.\n---\n\n# ${name}\n`;
}

/**
 * Write a canonical skill and (by default) a faithful exposure mirror.
 *
 * `mirrorEntries` lets a test ship an intentionally incomplete mirror, which is
 * the defect this checker previously missed. `linkMode` selects how the exposure
 * entry is written: a relative symlink (the contract), an absolute symlink, or a
 * plain copy — the latter two must both be rejected.
 */
function writeSkill(
  root,
  name,
  {
    body,
    files = {},
    mirror = true,
    mirrorEntries,
    linkMode = "relative",
    extraExposure = [],
  } = {},
) {
  const skillDir = path.join(root, ".claude", "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), body ?? skillBody(name));

  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(skillDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  if (!mirror) return root;

  const expoDir = path.join(root, ".agents", "skills", name);
  fs.mkdirSync(expoDir, { recursive: true });
  const topLevel = ["SKILL.md", ...Object.keys(files).map((rel) => rel.split("/")[0])];
  for (const entry of new Set(mirrorEntries ?? topLevel)) {
    const link = path.join(expoDir, entry);
    const canonicalEntry = path.join(skillDir, entry);
    if (linkMode === "copy") fs.writeFileSync(link, "copy of canonical content");
    else if (linkMode === "absolute") fs.symlinkSync(canonicalEntry, link);
    else fs.symlinkSync(path.relative(expoDir, canonicalEntry), link);
  }
  for (const entry of extraExposure) fs.writeFileSync(path.join(expoDir, entry), "extra");

  return root;
}

function runChecker(root) {
  return spawnSync("python3", [CHECKER, "--root", root], { encoding: "utf8" });
}

function failing(fixtureRoot) {
  const result = runChecker(fixtureRoot);
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}`);
  assert.match(result.stdout, /SKILL_LAYOUT_FAIL/);
  return result.stdout;
}

test("passes when the exposure mirror is complete", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    files: { "references/one.md": "# one\n", "scripts/run.sh": "#!/bin/sh\n" },
    body: `${skillBody("alpha")}\nSee [one](references/one.md).\n`,
  });

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /SKILL_LAYOUT_PASS active=1/);
});

test("fails when the exposure mirror omits a canonical entry", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    files: { "references/one.md": "# one\n" },
    body: `${skillBody("alpha")}\nSee [one](references/one.md).\n`,
    mirrorEntries: ["SKILL.md"],
  });

  const output = failing(root);
  assert.match(output, /Codex exposure is missing entry/);
  assert.match(output, /ln -s/);
});

test("fails when a SKILL.md link resolves only from the canonical tree", () => {
  // The regression: SKILL.md shipped into the exposure directory while the
  // references/ subtree it links to did not.
  const root = writeSkill(tmpRepo(), "alpha", {
    files: { "references/one.md": "# one\n" },
    body: `${skillBody("alpha")}\nSee [one](references/one.md).\n`,
    mirrorEntries: ["SKILL.md"],
  });

  const output = failing(root);
  assert.match(output, /link does not resolve from Codex exposure/);
  assert.match(output, /references\/one\.md/);
});

test("fails when a SKILL.md link resolves from neither root", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    body: `${skillBody("alpha")}\nSee [gone](references/gone.md).\n`,
  });

  const output = failing(root);
  assert.match(output, /broken relative link in/);
  assert.match(output, /references\/gone\.md/);
});

test("ignores links inside fenced code blocks and inline code spans", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    body:
      `${skillBody("alpha")}\n` +
      "```text\n" +
      "[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)\n" +
      "```\n\n" +
      "The literal `[x](references/also-missing.md)` is example text.\n",
  });

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
});

test("a longer fence is not closed early by a shorter one inside it", () => {
  // If the parser normalised every fence to three characters, the inner ``` line
  // would end the block and the link would be reported as broken.
  const root = writeSkill(tmpRepo(), "alpha", {
    body:
      `${skillBody("alpha")}\n` +
      "````text\n" +
      "```\n" +
      "[Snapshot](references/inside-the-block.md)\n" +
      "```\n" +
      "````\n",
  });

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
});

test("a fence marker followed by text stays inside the code block", () => {
  // Only a marker with nothing but whitespace after it closes a block. Teaching
  // the checker otherwise flips fence parity and discards the file's real links
  // as "code" — which silently disabled this check for 10 of 21 skills.
  const root = writeSkill(tmpRepo(), "alpha", {
    body:
      `${skillBody("alpha")}\n` +
      "```text\n" +
      "```text\n" +
      "[Snapshot](references/inside-the-block.md)\n" +
      "```\n",
  });

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
});

test("ignores a link inside a multi-backtick inline code span", () => {
  // A span closes on a run of the *same* length as its opener. Treating the
  // first two backticks as an empty span left the example to be read as a link.
  const root = writeSkill(tmpRepo(), "alpha", {
    body:
      `${skillBody("alpha")}\n` +
      "The literal ``[x](references/missing.md)`` is example text.\n",
  });

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
});

test("fails when a used reference-style link target is missing", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    body: `${skillBody("alpha")}\nSee [one][ref].\n\n[ref]: references/gone.md\n`,
  });

  const output = failing(root);
  assert.match(output, /broken relative link in/);
  assert.match(output, /references\/gone\.md/);
});

test("fails when a used reference-style link resolves only from the canonical tree", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    files: { "references/one.md": "# one\n" },
    body: `${skillBody("alpha")}\nSee [one][ref].\n\n[ref]: references/one.md\n`,
    mirrorEntries: ["SKILL.md"],
  });

  const output = failing(root);
  assert.match(output, /link does not resolve from Codex exposure/);
  assert.match(output, /references\/one\.md/);
});

test("does not treat an undefined reference or an in-code reference as a link", () => {
  // An undefined `[one][ref]` renders as literal text rather than a link, and a
  // definition inside a fence is example output, so neither is a finding.
  const root = writeSkill(tmpRepo(), "alpha", {
    body:
      `${skillBody("alpha")}\n` +
      "See [one][ref] with no definition.\n\n" +
      "```text\n" +
      "[ref]: references/also-missing.md\n" +
      "```\n",
  });

  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
});

test("fails when an exposure entry is a copy rather than a symlink", () => {
  const root = writeSkill(tmpRepo(), "alpha", { linkMode: "copy" });

  const output = failing(root);
  assert.match(output, /Codex exposure entry is not a symlink/);
});

test("fails when an exposure symlink is absolute", () => {
  const root = writeSkill(tmpRepo(), "alpha", { linkMode: "absolute" });

  const output = failing(root);
  assert.match(output, /symlink is absolute, expected relative/);
});

test("fails on an exposure entry that has no canonical counterpart", () => {
  const root = writeSkill(tmpRepo(), "alpha", { extraExposure: ["stray.md"] });

  const output = failing(root);
  assert.match(output, /unexpected Codex exposure entry/);
});

test("fails when frontmatter name does not match the directory", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    body: skillBody("beta"),
    mirrorEntries: ["SKILL.md"],
  });

  const output = failing(root);
  assert.match(output, /frontmatter name mismatch/);
});

test("fails when a retired skill reappears", () => {
  const root = writeSkill(tmpRepo(), "alpha", { mirror: false });
  fs.mkdirSync(path.join(root, ".claude", "skills", "maps-review"), { recursive: true });

  const output = failing(root);
  assert.match(output, /retired skill\/discovery entry exists: maps-review/);
});

test("the committed repository passes", () => {
  const result = runChecker(REPO_ROOT);
  assert.equal(
    result.status,
    0,
    `committed skill layout is inconsistent:\n${result.stdout}${result.stderr}`,
  );
  assert.match(result.stdout, /SKILL_LAYOUT_PASS active=\d+/);
});

test("rejects absent or empty skill descriptions", () => {
  for (const description of ["", "description: ", "description: ''"]) {
    const root = writeSkill(tmpRepo(), "alpha", {
      body: `---\nname: alpha\n${description}\n---\n\n# Alpha\n`,
    });
    assert.match(failing(root), /missing skill description|skill description must contain/);
  }
});

test("rejects malformed duplicate frontmatter and broad shell preapproval", () => {
  const fixture = (lines) => writeSkill(tmpRepo(), "alpha", {
    body: `---\nname: alpha\ndescription: Use when auditing skills.\n${lines}\n---\n# Skill\n`,
  });
  assert.match(failing(fixture("name: alpha")), /duplicate skill metadata key/);
  assert.match(failing(fixture("user-invocable: sometimes")), /must be true or false/);
  assert.match(failing(fixture("allowed-tools: Bash(npm:*)")), /broad shell preapproval/);
  assert.match(failing(fixture("allowed-tools: Bash(npx:*)")), /broad shell preapproval/);
});

test("accepts folded description and reports evaluation definitions as unexecuted", () => {
  const root = writeSkill(tmpRepo(), "alpha", {
    body: "---\nname: alpha\ndescription: >-\n  Use when verifying a skill.\n  Do not change production.\nmetadata:\n  version: 1.0\n---\n# Skill\n",
  });
  const result = runChecker(root);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /SKILL_EVAL_DEFINITIONS behavior=0\/1 trigger=0\/1 cases=0 \(not executed\)/);
});

test("rejects YAML block scalars hiding dangerous shell preapprovals", () => {
  const cases = [
    "allowed-tools: >\n  Bash(npm:*)\n  Bash(npx:*)",
    "allowed-tools: |\n  Bash(pnpm:*)\n  Bash(bun:*)",
    "allowed-tools: >-\n  Bash(sh:*)",
    "allowed-tools: |+ # multiline shell tools\n  Bash(*)",
    "allowed-tools: >2-\n    Bash(npx:*)",
    "allowed-tools:\n  - Bash(npm:*)",
  ];
  for (const allowed of cases) {
    const root = writeSkill(tmpRepo(), "alpha", {
      body: `---\nname: alpha\ndescription: Use when checking shell approvals.\n${allowed}\n---\n# Alpha\n`,
    });
    assert.match(failing(root), /allowed-tools.*single-line|broad shell preapproval/, allowed);
  }
});

test("allows safe single-line tool permissions and rejects encoded or aliased values", () => {
  const safe = writeSkill(tmpRepo(), "alpha", {
    body: "---\nname: alpha\ndescription: Use when checking safe metadata.\nallowed-tools: Read Glob Bash(git:status)\n---\n# Alpha\n",
  });
  assert.equal(runChecker(safe).status, 0);
  for (const allowed of [
    String.raw`allowed-tools: "Bash(n\u0070m:*)"`,
    "allowed-tools: *broadPermissions",
    "allowed-tools: Bash",
  ]) {
    const root = writeSkill(tmpRepo(), "alpha", {
      body: `---\nname: alpha\ndescription: Use when checking shell permissions.\n${allowed}\n---\n# Alpha\n`,
    });
    assert.match(failing(root), /allowed-tools.*single-line|broad shell preapproval/, allowed);
  }
});
