import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Maps maintenance contract", () => {
  it("keeps PR checks deterministic and live maintenance scheduled or manual", () => {
    expect(existsSync(".github/workflows/maps-skill-maintenance.yml")).toBe(true);
    const body = readFileSync(".github/workflows/maps-skill-maintenance.yml", "utf8");
    expect(body).toContain("schedule:");
    expect(body).toContain("workflow_dispatch:");
    expect(body).toContain("pull_request:");
    expect(body).toContain("maps-contracts:");
    expect(body).toContain("maps-live-maintenance:");
    expect(body).toContain("github.event_name != 'pull_request'");
    expect(body).toContain("continue-on-error: true");
    expect(body).toContain("check-visgl-compatibility.mjs");
    expect(body).toContain("check-google-maps-upstream.mjs");
    expect(body).toContain("check-maps-reference-links.mjs");
  });

  it("triggers for the workflow itself and current Maps/Places implementation surfaces", () => {
    const body = readFileSync(".github/workflows/maps-skill-maintenance.yml", "utf8");
    for (const path of [
      ".github/workflows/maps-skill-maintenance.yml",
      "src/**/maps/**",
      "src/**/places/**",
      "src/**/*map*.ts",
      "src/**/*map*.tsx",
      "src/**/*Map*.tsx",
    ]) expect(body, path).toContain(path);
  });

  it("ships maintenance scripts without weakening the canonical skill", () => {
    expect(existsSync(".claude/skills/maps/scripts/check-maps-reference-links.mjs")).toBe(true);
    expect(existsSync(".claude/skills/maps/scripts/check-visgl-compatibility.mjs")).toBe(true);
    const linkChecker = readFileSync(".claude/skills/maps/scripts/check-maps-reference-links.mjs", "utf8");
    expect(linkChecker).toContain("fetchWithRetry");
    expect(linkChecker).toContain('redirect: "follow"');
    expect(linkChecker).toContain("if (primary.length === 0)");
    expect(linkChecker).toContain("no primary references selected");

    const visgl = readFileSync(".claude/skills/maps/scripts/check-visgl-compatibility.mjs", "utf8");
    expect(visgl).toContain("APIProvider");
    expect(visgl).toContain("AdvancedMarker");
    expect(visgl).toContain("useMapsLibrary");
    expect(visgl).not.toContain("fetch(");

    const skill = readFileSync(".claude/skills/maps/SKILL.md", "utf8");
    expect(skill).toContain("## Demo key policy");
    expect(skill).toContain("prototypes only");
    expect(skill).toContain("restricted project credentials");
    expect(skill).toContain("Google Places provider summaries");
  });

  it("records freshness metadata for volatile Maps references", () => {
    const index = readFileSync(".claude/skills/maps/references/reference-index.md", "utf8");
    expect(index).toContain("Last reviewed: 2026-09-22");
    expect(index).toContain("Freshness: volatile");
  });
});
