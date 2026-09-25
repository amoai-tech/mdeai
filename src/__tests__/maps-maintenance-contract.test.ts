import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Maps maintenance contract", () => {
  it("keeps PR checks deterministic and live maintenance scheduled or manual", () => {
    expect(existsSync(".github/workflows/maps-skill-maintenance.yml")).toBe(true);
    const body = readFileSync(".github/workflows/maps-skill-maintenance.yml", "utf8");
    expect(body).toContain("schedule:");
    expect(body).toContain('cron: "23 13 * * 1"');
    expect(body).toContain("workflow_dispatch:");
    expect(body).toContain("pull_request:");
    expect(body).toContain("maps-contracts:");
    expect(body).toContain("maps-live-maintenance:");
    expect(body).toContain("github.event_name != 'pull_request'");
    expect(body).toContain("MAPS_CHECK_MODE: strict");
    // Operator-supplied workflow_dispatch inputs are a supply-chain surface
    // (Checkov CKV_GHA_7); the mode is fixed to strict in CI.
    expect(body).not.toContain("inputs:");
    // A blanket step-level `continue-on-error` previously let a confirmed broken
    // reference produce a green scheduled run. The scripts now own the exit code.
    expect(body).not.toContain("continue-on-error: true");
    // A failing first live check must not hide the second check's classification.
    expect(body).toContain("if: ${{ !cancelled() }}");
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
      "src/**/*Map*.ts",
      "src/**/*Map*.tsx",
      "src/**/*places*.ts",
      "src/**/*places*.tsx",
      "src/**/*place*.ts",
      "src/**/*place*.tsx",
      "src/__tests__/maps-*.test.ts",
      "package.json",
      "package-lock.json",
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

    // Both live checks must classify outcomes rather than exit blindly.
    const upstreamChecker = readFileSync(".claude/skills/maps/scripts/check-google-maps-upstream.mjs", "utf8");
    for (const script of [linkChecker, upstreamChecker]) {
      expect(script).toContain("check-classification.mjs");
      expect(script).toContain("reportCheckSummary");
      expect(script).toContain("resolveCheckMode");
    }
    expect(existsSync(".claude/skills/maps/scripts/check-classification.mjs")).toBe(true);

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
