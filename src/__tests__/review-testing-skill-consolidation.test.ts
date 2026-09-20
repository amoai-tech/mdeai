import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("review/testing skill consolidation", () => {
  it("keeps testing as the single test-strategy and TDD owner", () => {
    expect(existsSync(".claude/skills/tdd")).toBe(false);
    expect(existsSync(".agents/skills/tdd")).toBe(false);
    expect(existsSync(".claude/skills/testing/references/tdd.md")).toBe(true);
    expect(readFileSync(".claude/skills/testing/SKILL.md", "utf8")).toContain("RED → GREEN → REFACTOR");
  });

  it("keeps code-review as the single general and CI review owner", () => {
    expect(existsSync(".claude/skills/ci-review")).toBe(false);
    expect(existsSync(".claude/skills/code-review/references/ci-review.md")).toBe(true);
    expect(readFileSync(".claude/skills/code-review/SKILL.md", "utf8")).toContain("references/ci-review.md");
  });

  it("keeps systematic-debugging independent", () => {
    const debugging = readFileSync(".claude/skills/systematic-debugging/SKILL.md", "utf8");
    expect(debugging).toContain("Find the root cause before changing behavior");
    expect(debugging).toContain("`testing`");
    expect(debugging).not.toContain("`tdd`");
  });
});
