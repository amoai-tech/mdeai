import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Mastra registration in hosted runtimes", () => {
  it("registers all product agents without local workspace on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.resetModules();

    const { mastra } = await import("../index");
    expect(mastra.getWorkspace()).toBeUndefined();
    expect(Object.keys(mastra.listAgents())).toEqual(
      expect.arrayContaining([
        "pingAgent",
        "routerAgent",
        "rentalAgent",
        "conciergeAgent",
        "eventAgent",
        "evaluationAgent",
        "hostEventAgent",
        "hostOpsAgent",
        "partnerAgent",
      ]),
    );
    expect(Object.keys(mastra.listAgents())).toHaveLength(9);
    const concierge = mastra.getAgentById("concierge-agent");
    expect(concierge).toBeDefined();
    // Removing inherited file tools must preserve the actual discovery actions.
    const tools = Object.keys(await concierge.listTools());
    expect(tools).toEqual(
      expect.arrayContaining([
        "searchRentalsTool",
        "searchEventsTool",
        "searchRestaurantsTool",
      ]),
    );
    expect(tools.some((id) => id.includes("workspace"))).toBe(false);
  }, 15_000); // Real registry import can exceed Vitest's 5s default in parallel floor runs.

  it("does not expose Builder in the Next app with a shared local opt-in", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "");
    vi.resetModules();

    const { mastra } = await import("../index");
    expect(Object.keys(mastra.listAgents())).toHaveLength(9);
    expect(mastra.getEditor()).toBeUndefined();
  }, 15_000);

  it("does not initialize Builder during Next production builds", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.resetModules();

    const { mastra } = await import("../index");
    expect(Object.keys(mastra.listAgents())).toHaveLength(9);
    expect(mastra.getEditor()).toBeUndefined();
  }, 15_000);

  it("enables the visual Builder only through explicit local opt-in", async () => {
    const root = mkdtempSync(join(tmpdir(), "mde-mastra-builder-"));
    mkdirSync(join(root, ".mastra"));
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("MASTRA_DEV_LIBSQL", "1");
    vi.stubEnv("PWD", root);
    vi.resetModules();

    try {
      const { mastra } = await import("../index");
      expect(Object.keys(mastra.listAgents())).toHaveLength(10);
      expect(mastra.listAgents()).toHaveProperty("builderAgent");
      expect(mastra.getEditor()).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});
