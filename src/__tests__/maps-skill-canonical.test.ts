import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const retiredMapsAliases = [
  ["maps", "review"].join("-"),
  ["mde", "maps"].join("-"),
];

describe("canonical Maps skill", () => {
  it("keeps the canonical Maps skill resources", () => {
    for (const path of [
      ".claude/skills/maps/SKILL.md",
      ".claude/skills/maps/references",
      ".claude/skills/maps/scripts",
      ".claude/skills/maps/tests",
    ]) {
      expect(existsSync(path), `missing canonical Maps resource: ${path}`).toBe(true);
    }
  });

  it("does not track retired Maps skill aliases", () => {
    const tracked = execFileSync(
      "git",
      ["ls-files", ...retiredMapsAliases.flatMap((name) => [`.claude/skills/${name}`, `.agents/skills/${name}`])],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);

    expect(tracked).toEqual([]);
  });
});
