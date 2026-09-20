import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
      ".claude/skills/maps/scripts/check-google-maps-upstream.mjs",
      ".claude/skills/maps/references/reference-index.md",
    ]) {
      expect(existsSync(path), `missing canonical Maps resource: ${path}`).toBe(true);
    }
  });

  it("keeps current-doc, React, legacy, failure, and compliance guardrails without volatile claims", () => {
    const body = readFileSync(".claude/skills/maps/SKILL.md", "utf8");

    for (const required of [
      "## Current Google guidance workflow",
      "@vis.gl/react-google-maps",
      "## Legacy API hard failures",
      "## Critical failure checks",
      "## Compliance review",
      "## Product-selection routing matrix",
      "## Maps completion evidence gate",
      "## Source precedence and freshness",
      "references/reference-index.md",
      "mapscodeassist.googleapis.com/mcp",
      "explicit `language` and `region`",
      "google-map-react",
      "@react-google-maps/api",
      "Pricing, free tiers, geographic availability, preview/GA status, field availability, and quotas are volatile.",
    ]) {
      expect(body).toContain(required);
    }

    for (const staleClaim of [
      "English only; US and India only currently",
      "free as of 2026-05",
      "500/day",
      "$25/1K",
      "Maps Grounding Lite (MCP) — **GA**",
    ]) {
      expect(body).not.toContain(staleClaim);
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
