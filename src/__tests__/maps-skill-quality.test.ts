import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bannedLegacyTokens = [
  "AutocompleteService", "PlacesService", "DirectionsService", "DirectionsRenderer",
  "DrawingManager", "HeatmapLayer", "useMarkerRef", "'drawing'", "'visualization'",
];

function expectNoLegacyApis(name: string, body: string) {
  for (const token of bannedLegacyTokens) expect(body, `${name}: ${token}`).not.toContain(token);
}

describe("Maps skill quality contract", () => {
  it("ships realistic skill eval prompts", () => {
    expect(existsSync(".claude/skills/maps/evals/evals.json")).toBe(true);
    const data = JSON.parse(readFileSync(".claude/skills/maps/evals/evals.json", "utf8")) as {
      skill_name: string;
      evals: unknown[];
    };
    expect(data.skill_name).toBe("maps");
    expect(data.evals.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps trigger boundaries in frontmatter rather than a body routing section", () => {
    const skill = readFileSync(".claude/skills/maps/SKILL.md", "utf8");
    expect(skill).not.toContain("## When NOT to use");
    expect(skill).toContain("Do not use for generic GIS");
  });

  it("keeps active React references free of banned legacy implementation APIs", () => {
    expectNoLegacyApis("components-api.md", readFileSync(".claude/skills/maps/references/react-vis-gl/components-api.md", "utf8"));
    expectNoLegacyApis("geometry-components.md", readFileSync(".claude/skills/maps/references/react-vis-gl/geometry-components.md", "utf8"));
    expectNoLegacyApis("hooks-api.md", readFileSync(".claude/skills/maps/references/react-vis-gl/hooks-api.md", "utf8"));
    expectNoLegacyApis("patterns.md", readFileSync(".claude/skills/maps/references/react-vis-gl/patterns.md", "utf8"));
    const placesAutocomplete = readFileSync(".claude/skills/maps/references/react-vis-gl/places-autocomplete.md", "utf8");
    expectNoLegacyApis("places-autocomplete.md", placesAutocomplete);
    expect(placesAutocomplete).toContain("try {");
    expect(placesAutocomplete).toContain("catch (error)");
  });

  it("adds a contents section to large non-vendored references", () => {
    const geometry = readFileSync(".claude/skills/maps/references/react-vis-gl/geometry-components.md", "utf8");
    const patterns = readFileSync(".claude/skills/maps/references/react-vis-gl/patterns.md", "utf8");
    expect(geometry).toMatch(/^## (Contents|Table of contents)$/m);
    expect(patterns).toMatch(/^## (Contents|Table of contents)$/m);
  });

  it("does not collapse Google provider summaries into generic MDE ai_summary", () => {
    const skill = readFileSync(".claude/skills/maps/SKILL.md", "utf8");
    expect(skill).not.toContain("Store as `ai_summary`; show `disclosureText`");
    expect(skill.toLowerCase()).toContain("preserve provider provenance and disclosure");
  });
});
