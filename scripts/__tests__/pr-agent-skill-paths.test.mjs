import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
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

function addSupabaseReviewSymlink(root, target = "../../../../.claude/skills/supabase/references/review.md") {
  const link = join(root, "scripts/pr-agent/skills/supabase/review.md");
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link);
}

describe("SAN-1312 PR-Agent skill path validation", () => {
  it("never selects a specialist file that the pinned PR-Agent loader ignores", () => {
    // v0.46 discover_skills accepts a direct file path only when named SKILL.md.
    const { paths } = selectSkills(SUPABASE_CHANGE);
    assert.ok(paths.every((path) => path.endsWith("/SKILL.md")), paths.join(", "));
  });

  it("selects discoverable specialist SKILL.md wrappers containing canonical references", () => {
    const { skills, paths } = selectSkills(SUPABASE_CHANGE);
    assert.deepEqual(skills, ["code-review", "supabase"]);
    assert.deepEqual(paths, [
      "/github/workspace/.claude/skills/code-review/SKILL.md",
      "/github/workspace/scripts/pr-agent/skills/supabase/SKILL.md",
    ]);
  });

  it("rejects a missing SKILL.md entrypoint when a resource is present", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      "scripts/pr-agent/skills/supabase/review.md",
    ]);
    const { paths } = selectSkills(SUPABASE_CHANGE);
    assert.throws(
      () => assertSelectedPathsExist(paths, existsIn(root)),
      /required trusted PR-Agent skill missing: scripts\/pr-agent\/skills\/supabase\/SKILL.md/,
    );
  });

  it("rejects a missing review resource even when its SKILL.md wrapper exists", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      "scripts/pr-agent/skills/supabase/SKILL.md",
    ]);
    const { paths } = selectSkills(SUPABASE_CHANGE);
    assert.throws(
      () => assertSelectedPathsExist(paths, existsIn(root)),
      /required trusted PR-Agent review resource missing: scripts\/pr-agent\/skills\/supabase\/review.md/,
    );
  });

  it("passes when every selected entrypoint and bundled review resource exists", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      "scripts/pr-agent/skills/supabase/SKILL.md",
      ".claude/skills/supabase/references/review.md",
    ]);
    addSupabaseReviewSymlink(root);
    const { paths } = selectSkills(SUPABASE_CHANGE);
    assert.doesNotThrow(() => assertSelectedPathsExist(paths, existsIn(root), root));
  });

  it("rejects a review symlink to /proc/self/environ even though it exists", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      "scripts/pr-agent/skills/supabase/SKILL.md",
    ]);
    addSupabaseReviewSymlink(root, "/proc/self/environ");
    assert.throws(
      () => assertSelectedPathsExist(selectSkills(SUPABASE_CHANGE).paths, existsIn(root), root),
      /untrusted PR-Agent review resource target/,
    );
  });

  it("rejects a review symlink into the wrong domain inside the checkout", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      "scripts/pr-agent/skills/supabase/SKILL.md",
      ".claude/skills/mastra/references/review.md",
    ]);
    addSupabaseReviewSymlink(root, "../../../../.claude/skills/mastra/references/review.md");
    assert.throws(
      () => assertSelectedPathsExist(selectSkills(SUPABASE_CHANGE).paths, existsIn(root), root),
      /untrusted PR-Agent review resource target/,
    );
  });

  it("rejects an escaped symlink at the canonical review file itself", () => {
    const root = fixtureRoot([
      ".claude/skills/code-review/SKILL.md",
      "scripts/pr-agent/skills/supabase/SKILL.md",
    ]);
    const canonical = join(root, ".claude/skills/supabase/references/review.md");
    mkdirSync(dirname(canonical), { recursive: true });
    symlinkSync("/proc/self/environ", canonical);
    addSupabaseReviewSymlink(root);
    assert.throws(
      () => assertSelectedPathsExist(selectSkills(SUPABASE_CHANGE).paths, existsIn(root), root),
      /untrusted PR-Agent review resource target/,
    );
  });

  it("rejects bare review.md paths even when they exist", () => {
    const root = fixtureRoot([".claude/skills/supabase/references/review.md"]);
    const oldPath = "/github/workspace/.claude/skills/supabase/references/review.md";
    assert.throws(
      () => assertSelectedPathsExist([oldPath], existsIn(root)),
      /cannot discover an individual skill not named SKILL.md/,
    );
  });

  it("bundles the real canonical domain review rules through narrow, discoverable skills", () => {
    const names = ["copilotkit", "mastra", "supabase", "maps", "stripe", "nextjs"];
    const { paths } = selectSkills(["package.json"]);
    for (const name of names) {
      const relative = "scripts/pr-agent/skills/" + name;
      const entrypoint = join(REPO_ROOT, relative, "SKILL.md");
      const resource = join(REPO_ROOT, relative, "review.md");
      const canonical = join(REPO_ROOT, ".claude", "skills", name, "references", "review.md");
      assert.ok(paths.includes("/github/workspace/" + relative + "/SKILL.md"), name);
      assert.match(readFileSync(entrypoint, "utf8"), /^---\nname: mde-pr-review-[a-z-]+\ndescription: [^\n]+\n---\n/);
      assert.equal(lstatSync(resource).isSymbolicLink(), true, name + " review is not copied");
      assert.equal(realpathSync(resource), realpathSync(canonical), name + " resolves to canonical reference");
      const review = readFileSync(resource, "utf8");
      const invariant = {
        copilotkit: "Preserve same-origin",
        mastra: "RequestContext carries request metadata",
        supabase: "User A must not read",
        maps: "Do not invent or transform ungrounded coordinates",
        stripe: "duplicate delivery must not duplicate tickets",
        nextjs: "Async Request APIs are async-only",
      }[name];
      assert.ok(invariant, name + " has a domain-specific expectation");
      assert.ok(review.includes(invariant), name + " lost substantive guidance: " + invariant);
    }
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
    assert.ok(paths.every((path) => path.endsWith("/SKILL.md")));
    assert.doesNotThrow(() => assertSelectedPathsExist(paths, existsIn(REPO_ROOT)));
  });
});
