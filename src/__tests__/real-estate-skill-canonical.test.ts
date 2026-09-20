import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const retiredSkill = ["mde", "real", "estate"].join("-");

function activeAliasMatches(): string[] {
  try {
    return execFileSync(
      "git",
      ["grep", "-l", "--", retiredSkill, ":!docs/_archive/**"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}

describe("real-estate skill canonicalization", () => {
  it("keeps only the canonical real-estate skill directories", () => {
    expect(existsSync(".claude/skills/real-estate/SKILL.md")).toBe(true);
    expect(existsSync(".agents/skills/real-estate/SKILL.md")).toBe(true);
    expect(existsSync(".claude/skills/real-estate/marketplace-v1.md")).toBe(true);
    expect(existsSync(".claude/skills/real-estate/mls-v2.md")).toBe(true);
    expect(existsSync(".claude/skills/real-estate/industry-context.md")).toBe(true);
    expect(existsSync(".claude/skills/real-estate/sub-agents/lead-qualifier.md")).toBe(true);
    expect(existsSync(".claude/skills/real-estate/sub-agents/neighborhood-guide.md")).toBe(true);
    expect(existsSync(".claude/skills/real-estate/sub-agents/property-description.md")).toBe(true);
    expect(existsSync(".claude/skills/real-estate/gemini")).toBe(true);

    const retiredTrackedPaths = execFileSync(
      "git",
      [
        "ls-files",
        `.claude/skills/${retiredSkill}`,
        `.agents/skills/${retiredSkill}`,
      ],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);

    expect(retiredTrackedPaths).toEqual([]);
  });

  it("contains no active references to the retired skill alias", () => {
    expect(activeAliasMatches()).toEqual([]);
  });
});
