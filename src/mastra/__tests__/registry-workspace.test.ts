import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Mastra registration in hosted runtimes", () => {
  it("registers all product agents without local workspace on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
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
      ]),
    );
    expect(Object.keys(mastra.listAgents())).toHaveLength(8);
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
});
