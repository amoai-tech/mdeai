import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Maps maintenance contract", () => {
  it("runs drift, link-health, and vis.gl compatibility checks on schedule and Maps changes", () => {
    expect(existsSync(".github/workflows/maps-skill-maintenance.yml")).toBe(true);
    const body = readFileSync(".github/workflows/maps-skill-maintenance.yml", "utf8");
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
    expect(existsSync(".claude/skills/maps/scripts/check-maps-reference-links.mjs")).toBe(true);
    expect(existsSync(".claude/skills/maps/scripts/check-visgl-compatibility.mjs")).toBe(true);
    const linkChecker = readFileSync(".claude/skills/maps/scripts/check-maps-reference-links.mjs", "utf8");
    expect(linkChecker).toContain("if (!location)");
    expect(linkChecker).toContain("redirect missing Location header");

    const skill = readFileSync(".claude/skills/maps/SKILL.md", "utf8");
    expect(skill).toContain("## Demo key policy");
    expect(skill).toContain("prototypes only");
    expect(skill).toContain("restricted project credentials");
    expect(skill).toContain("Google Places provider summaries");
  });

  it("records freshness metadata for volatile Maps references", () => {
    const index = readFileSync(".claude/skills/maps/references/reference-index.md", "utf8");
    expect(index).toContain("Last reviewed: 2026-09-20");
    expect(index).toContain("Freshness: volatile");
  });
});
