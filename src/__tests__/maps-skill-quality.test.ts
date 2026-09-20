import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const skillRoot = ".claude/skills/maps";
const read = (path: string) => readFileSync(path, "utf8");

describe("Maps skill quality contract", () => {
  it("ships realistic skill eval prompts", () => {
    const evalPath = `${skillRoot}/evals/evals.json`;
    expect(existsSync(evalPath)).toBe(true);
    const data = JSON.parse(read(evalPath)) as { skill_name: string; evals: unknown[] };
    expect(data.skill_name).toBe("maps");
    expect(data.evals.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps trigger boundaries in frontmatter rather than a body routing section", () => {
    const skill = read(`${skillRoot}/SKILL.md`);
    expect(skill).not.toContain("## When NOT to use");
    expect(skill).toContain("Do not use for generic GIS");
  });

  it("keeps active React references free of banned legacy implementation APIs", () => {
    const dir = `${skillRoot}/references/react-vis-gl`;
    const banned = [
      "AutocompleteService", "PlacesService", "DirectionsService", "DirectionsRenderer",
      "DrawingManager", "HeatmapLayer", "useMarkerRef", "'drawing'", "'visualization'",
    ];
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".md"))) {
      const body = read(join(dir, name));
      for (const token of banned) expect(body, `${name}: ${token}`).not.toContain(token);
    }
  });

  it("adds a contents section to large non-vendored references", () => {
    const dir = `${skillRoot}/references`;
    const walk = (path: string): string[] => readdirSync(path).flatMap((name) => {
      const child = join(path, name);
      return statSync(child).isDirectory() ? walk(child) : [child];
    });
    for (const path of walk(dir).filter((p) => p.endsWith(".md") && !p.includes("/vendor/"))) {
      const body = read(path);
      if (body.split("\n").length > 300) expect(body, path).toMatch(/^## (Contents|Table of contents)$/m);
    }
  });

  it("does not collapse Google provider summaries into generic MDE ai_summary", () => {
    const skill = read(`${skillRoot}/SKILL.md`);
    expect(skill).not.toContain("Store as `ai_summary`; show `disclosureText`");
    expect(skill.toLowerCase()).toContain("preserve provider provenance and disclosure");
  });
});
