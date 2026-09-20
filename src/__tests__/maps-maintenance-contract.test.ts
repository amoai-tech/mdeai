import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Maps maintenance contract", () => {
  it("runs drift, link-health, and vis.gl compatibility checks on schedule and Maps changes", () => {
    const workflow = ".github/workflows/maps-skill-maintenance.yml";
    expect(existsSync(workflow)).toBe(true);
    const body = read(workflow);
    expect(body).toContain("schedule:");
    expect(body).toContain("cron:");
    expect(body).toContain("pull_request:");
    expect(body).toContain(".claude/skills/maps/**");
    expect(body).toContain("@vis.gl/react-google-maps");
    expect(body).toContain("check-google-maps-upstream.mjs");
    expect(body).toContain("check-maps-reference-links.mjs");
    expect(body).toContain("check-visgl-compatibility.mjs");
  });

  it("ships maintenance scripts without weakening the canonical skill", () => {
    for (const path of [
      ".claude/skills/maps/scripts/check-maps-reference-links.mjs",
      ".claude/skills/maps/scripts/check-visgl-compatibility.mjs",
    ]) expect(existsSync(path)).toBe(true);

    const skill = read(".claude/skills/maps/SKILL.md");
    expect(skill).toContain("## Demo key policy");
    expect(skill).toContain("prototypes only");
    expect(skill).toContain("restricted project credentials");
    expect(skill).toContain("Google Places provider summaries");
  });

  it("records freshness metadata for volatile Maps references", () => {
    const index = read(".claude/skills/maps/references/reference-index.md");
    expect(index).toContain("Last reviewed: 2026-09-20");
    expect(index).toContain("Freshness: volatile");
  });
});
