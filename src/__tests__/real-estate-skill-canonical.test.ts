import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const retiredSkill = ["mde", "real", "estate"].join("-");
const canonicalSkill = "real-estate";
const retiredPaths = [
  `.claude/skills/${retiredSkill}`,
  `.agents/skills/${retiredSkill}`,
];

function trackedActiveFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((path) => !path.startsWith("docs/_archive/"));
}

describe("real-estate skill canonicalization", () => {
  it("keeps only the canonical real-estate skill directories", () => {
    expect(existsSync(`.claude/skills/${canonicalSkill}/SKILL.md`)).toBe(true);
    expect(existsSync(`.agents/skills/${canonicalSkill}/SKILL.md`)).toBe(true);
    expect(retiredPaths.filter((path) => existsSync(path))).toEqual([]);
  });

  it("contains no active references to the retired skill alias", () => {
    const offenders = trackedActiveFiles().filter((path) => {
      try {
        return readFileSync(path, "utf8").includes(retiredSkill);
      } catch {
        return false;
      }
    });

    expect(offenders).toEqual([]);
  });
});
