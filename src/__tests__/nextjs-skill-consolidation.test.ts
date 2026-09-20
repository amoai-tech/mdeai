import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Next.js skill consolidation", () => {
  it("keeps nextjs as the only top-level Next.js/Vercel domain owner", () => {
    expect(existsSync(".claude/skills/nextjs/SKILL.md")).toBe(true);
    expect(existsSync(".claude/skills/nextjs-review")).toBe(false);
    expect(existsSync(".claude/skills/mde-vercel")).toBe(false);
    expect(existsSync(".agents/skills/mde-vercel")).toBe(false);
  });

  it("preserves specialist guidance through progressive-disclosure references", () => {
    for (const file of ["review.md", "vercel.md", "performance.md", "app-router.md", "caching.md"]) {
      expect(existsSync(`.claude/skills/nextjs/references/${file}`)).toBe(true);
    }
    const skill = readFileSync(".claude/skills/nextjs/SKILL.md", "utf8");
    expect(skill).toContain("references/review.md");
    expect(skill).toContain("references/vercel.md");
    expect(skill).toContain("references/performance.md");
  });

  it("preserves exact-version review and safe deploy invariants", () => {
    expect(readFileSync(".claude/skills/nextjs/references/review.md", "utf8")).toContain("await cookies()");
    expect(readFileSync(".claude/skills/nextjs/references/review.md", "utf8")).toContain("src/proxy.ts");
    expect(readFileSync(".claude/skills/nextjs/references/vercel.md", "utf8")).toContain("preview");
    expect(readFileSync(".claude/skills/nextjs/references/performance.md", "utf8")).toContain("Bundle Size Optimization");
  });
});
