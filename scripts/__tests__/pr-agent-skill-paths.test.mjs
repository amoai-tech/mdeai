import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  assertSelectedPathsExist,
  selectSkills,
  toRepoPath,
} from "../select-pr-agent-skills.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A changed-file set that selects the universal skill plus the Supabase specialist. */
const SUPABASE_CHANGE = ["supabase/migrations/20260101000000_add_thing.sql"];

function fixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "mde-pr-agent-skills-"));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "# fixture\n", "utf8");
  }
  return root;
}

const existsIn = (root) => (path) => existsSync(join(root, path));

describe("SAN-1312 PR-Agent skill path validation", () => {
  it("selects an exact specialist reference path, not the parent SKILL.md", () => {
    const { skills, paths } = selectSkills(SUPABASE_CHANGE);
    assert.deepEqual(skills, ["code-review", "supabase"]);
    assert.deepEqual(paths, [
      "/github/workspace/.claude/skills/code-review/SKILL.md",
      "/github/workspace/.claude/skills/supabase/references/review.md",
    ]);
  });

  it("rejects a missing specialist review.md even when its parent SKILL.md exists", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      ".claude/skills/supabase/SKILL.md",
    ]);

    // The decoy that the previous implementation validated: the parent skill exists.
    assert.equal(existsSync(join(root, ".claude/skills/supabase/SKILL.md")), true);
    // The file PR-Agent actually loads does not.
    assert.equal(existsSync(join(root, ".claude/skills/supabase/references/review.md")), false);

    const { paths } = selectSkills(SUPABASE_CHANGE);
    assert.throws(
      () => assertSelectedPathsExist(paths, existsIn(root)),
      /required trusted PR-Agent skill missing: \.claude\/skills\/supabase\/references\/review\.md/,
    );
  });

  it("passes when every selected path resolves to a real file", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      ".claude/skills/supabase/SKILL.md",
      ".claude/skills/supabase/references/review.md",
    ]);
    const { paths } = selectSkills(SUPABASE_CHANGE);
    assert.doesNotThrow(() => assertSelectedPathsExist(paths, existsIn(root)));
  });

  it("rejects a selected path outside the PR-Agent container workspace", () => {
    assert.throws(() => toRepoPath("/etc/passwd"), /must be inside \/github\/workspace/);
    assert.throws(() => toRepoPath(undefined), /must be inside \/github\/workspace/);
  });

  it("maps every package.json selection to a file that exists in this checkout", () => {
    const { skills, paths } = selectSkills(["package.json"]);
    // package.json selects the universal skill plus every specialist.
    assert.equal(skills.length, 7);
    assert.equal(paths.length, skills.length);
    assert.doesNotThrow(() => assertSelectedPathsExist(paths, existsIn(REPO_ROOT)));
  });
});
