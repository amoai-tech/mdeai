import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexPath = ".claude/skills/maps/references/reference-index.md";

const requiredUrls = [
  "https://developers.google.com/maps/documentation",
  "https://developers.google.com/maps/get-started",
  "https://developers.google.com/maps/apis-by-platform",
  "https://developers.google.com/maps/architecture",
  "https://developers.google.com/maps/documentation/capabilities-explorer",
  "https://developers.google.com/maps/documentation/places/web-service/overview",
  "https://developers.google.com/maps/documentation/places/web-service/place-summaries",
  "https://developers.google.com/maps/ai",
  "https://developers.google.com/maps/ai/agent-skills",
  "https://developers.google.com/maps/ai/code-assist",
  "https://ai.google.dev/gemini-api/docs/maps-grounding",
  "https://docs.cloud.google.com/architecture/agentic-ai-system-with-grounding-using-maps",
  "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-maps",
  "https://mapsplatform.google.com/maps-products/grounding/",
  "https://mapsplatform.google.com/maps-demo-key/",
  "https://github.com/googlemaps/agent-skills",
  "https://github.com/googlemaps/platform-ai",
  "https://github.com/visgl/react-google-maps",
  "https://visgl.github.io/react-google-maps/",
  "https://developers.google.com/codelabs/maps-platform/maps-platform-101-react-js",
  "https://developers.google.com/maps/documentation/javascript/examples/rgm-basic-map",
  "https://github.com/deusyu/google-maps-skill",
  "https://serpapi.com/google-maps-api",
  "https://mcpmarket.com/tools/skills/google-maps-automation-1",
  "https://lobehub.com/es/skills/openclaw-skills-google-maps",
];

describe("Maps reference index", () => {
  it("exists and indexes the required source families", () => {
    expect(existsSync(indexPath)).toBe(true);
    const body = readFileSync(indexPath, "utf8");
    for (const url of requiredUrls) expect(body).toContain(url);
  });

  it("records authority, use case, real-world example, and score", () => {
    const body = readFileSync(indexPath, "utf8");
    for (const heading of ["Authority", "Use case", "Real-world example", "Score"]) {
      expect(body).toContain(heading);
    }
  });
  it("keeps product, marketing, and blog sources below implementation-authority scores", () => {
    const body = readFileSync(indexPath, "utf8");
    const rows = body.split("\n").filter((line) => line.startsWith("| ["));
    for (const row of rows) {
      const authority = row.split("|")[2]?.trim() ?? "";
      if (!/(product page|blog|community|third-party)/i.test(authority)) continue;
      const score = Number(row.match(/\|\s*(\d+)\/10\s*\|\s*$/)?.[1]);
      expect(score, row).toBeLessThanOrEqual(7);
    }
  });

});
