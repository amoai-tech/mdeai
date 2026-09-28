import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const CHECKER = path.resolve("scripts/check-skill-layout.py");
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-windows-"));
  tempDirs.push(dir);
  return dir;
}

/**
 * Build a skill whose exposure mirror is written the way Git for Windows writes it
 * without symlink support: a regular file containing the link target.
 */
function writeWindowsCheckout(root, name, { asSymlinks = false } = {}) {
  const skillDir = path.join(root, ".claude", "skills", name);
  fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when testing the Windows hint.\n---\n\n# ${name}\n`,
  );
  fs.writeFileSync(path.join(skillDir, "references/one.md"), "# one\n");

  const expoDir = path.join(root, ".agents", "skills", name);
  fs.mkdirSync(expoDir, { recursive: true });
  for (const entry of ["SKILL.md", "references"]) {
    const link = path.join(expoDir, entry);
    if (asSymlinks) {
      fs.symlinkSync(path.relative(expoDir, path.join(skillDir, entry)), link);
    } else {
      fs.writeFileSync(link, path.relative(expoDir, path.join(skillDir, entry)));
    }
  }
  return root;
}

function run(root) {
  return spawnSync("python3", [CHECKER, "--root", root], { encoding: "utf8" });
}

test("explains a Windows checkout instead of listing every entry as a bad symlink", () => {
  const result = run(writeWindowsCheckout(tmpRepo(), "alpha"));

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /plain files whose contents are their link targets/);
  assert.match(result.stdout, /core\.symlinks=true/);
  // One message for the skill, not one per mirrored entry.
  assert.equal(
    result.stdout.split("\n").filter((line) => line.startsWith("- ")).length,
    1,
    result.stdout,
  );
  // The old, unhelpful phrasing must be gone for this failure mode.
  assert.doesNotMatch(result.stdout, /Codex exposure entry is not a symlink/);
});

test("stays quiet when the mirror really is symlinked", () => {
  const result = run(writeWindowsCheckout(tmpRepo(), "alpha", { asSymlinks: true }));

  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /SKILL_LAYOUT_PASS/);
});

test("does not mistake a copied file for a Windows checkout", () => {
  // A real copy is arbitrary content, not a link target, so it must still be
  // reported as the defect it is rather than excused as a platform artefact.
  const root = writeWindowsCheckout(tmpRepo(), "alpha", { asSymlinks: true });
  const link = path.join(root, ".agents", "skills", "alpha", "SKILL.md");
  fs.rmSync(link);
  fs.writeFileSync(link, "copy of canonical content\n");

  const result = run(root);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Codex exposure entry is not a symlink/);
  assert.doesNotMatch(result.stdout, /core\.symlinks/);
});
