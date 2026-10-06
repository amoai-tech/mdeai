import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

test("nextjs stays the only React/Next.js/Vercel owner with progressive references", () => {
  assert.equal(existsSync(".claude/skills/nextjs/SKILL.md"), true);
  for (const retired of [
    "nextjs-review",
    "mde-vercel",
    "vercel-composition-patterns",
    "vercel-react-best-practices",
  ]) {
    assert.equal(existsSync(`.claude/skills/${retired}`), false);
    assert.equal(existsSync(`.agents/skills/${retired}`), false);
  }

  const skill = read(".claude/skills/nextjs/SKILL.md");
  for (const ref of [
    "references/app-router.md",
    "references/caching.md",
    "references/composition-patterns.md",
    "references/react-best-practices.md",
    "references/performance.md",
    "references/review.md",
    "references/vercel.md",
  ]) {
    assert.equal(existsSync(`.claude/skills/nextjs/${ref}`), true);
    assert.match(skill, new RegExp(ref.replace(".", "\\.")));
  }
});

test("nextjs does not duplicate installed package version truth", () => {
  const skill = read(".claude/skills/nextjs/SKILL.md");
  assert.doesNotMatch(skill, /verified-package:/);
  assert.match(skill, /Resolve the exact installed Next\.js version from `package\.json`/);
});

test("React rules and MDE performance proof have separate responsibilities", () => {
  const rules = read(".claude/skills/nextjs/references/react-best-practices.md");
  const proof = read(".claude/skills/nextjs/references/performance.md");
  assert.match(rules, /Eliminate waterfalls/);
  assert.match(rules, /Control bundle cost/);
  assert.match(proof, /## Measurement workflow/);
  assert.match(proof, /before and after/);
  assert.doesNotMatch(proof, /## Priority order/);
});

test("materially changed owners have realistic 20-query trigger suites", () => {
  for (const skillName of ["frontend-design", "nextjs"]) {
    const path = `.claude/skills/${skillName}/evals/trigger-evals.json`;
    assert.equal(existsSync(path), true);
    const cases = readJson(path);
    assert.equal(cases.length, 20);
    const positives = cases.filter((entry) => entry.should_trigger === true).length;
    const negatives = cases.filter((entry) => entry.should_trigger === false).length;
    assert.ok(positives >= 10, `${skillName}: expected at least 10 positives`);
    assert.ok(negatives >= 8, `${skillName}: expected at least 8 near-miss negatives`);
  }
});
