import { describe, expect, it, vi } from "vitest";
import {
  locationBiasFromMapUi,
  resolveGroundingLocationBias,
  resolveGroundingMemory,
} from "../grounding-location-bias";

const viewportMapUi = {
  selectedPinId: null,
  activeCategories: ["grounded" as const],
  viewport: { lat: 6.25, lng: -75.58, zoom: 13 },
};

describe("grounding location bias", () => {
  it("prefers explicit tool input", async () => {
    const bias = await resolveGroundingLocationBias(
      { locationBias: { latitude: 6.2, longitude: -75.5 } },
      {
        memory: {
          getWorkingMemory: async () => JSON.stringify({ mapUi: viewportMapUi }),
        },
      },
    );
    expect(bias).toEqual({ latitude: 6.2, longitude: -75.5 });
  });

  it("reads the current mapUi.viewport from thread memory", async () => {
    const getWorkingMemory = vi.fn(async () => JSON.stringify({ mapUi: viewportMapUi }));
    const bias = await resolveGroundingLocationBias(
      {},
      { memory: { getWorkingMemory }, threadId: "thread-1", resourceId: "user-1" },
    );
    expect(bias).toEqual({ latitude: 6.25, longitude: -75.58 });
    expect(getWorkingMemory).toHaveBeenCalledWith({
      threadId: "thread-1",
      resourceId: "user-1",
    });
  });

  it("preserves the memory object as the method receiver", async () => {
    const memory = {
      label: "thread-memory",
      async getWorkingMemory() {
        if (this.label !== "thread-memory") throw new Error("lost receiver");
        return JSON.stringify({ mapUi: viewportMapUi });
      },
    };
    const bias = await resolveGroundingLocationBias({}, { memory });
    expect(bias).toEqual({ latitude: 6.25, longitude: -75.58 });
  });

  it("accepts working memory returned as an object", async () => {
    const bias = await resolveGroundingLocationBias(
      {},
      { memory: { getWorkingMemory: async () => ({ mapUi: viewportMapUi }) } },
    );
    expect(bias).toEqual({ latitude: 6.25, longitude: -75.58 });
  });

  it("rejects invalid latitude, longitude and zoom", async () => {
    for (const viewport of [
      { lat: 1000, lng: -75.58, zoom: 13 },
      { lat: 6.25, lng: -999, zoom: 13 },
      { lat: 6.25, lng: -75.58, zoom: 99 },
    ]) {
      const bias = await resolveGroundingLocationBias(
        {},
        {
          memory: {
            getWorkingMemory: async () => ({ mapUi: { ...viewportMapUi, viewport } }),
          },
        },
      );
      expect(bias).toBeUndefined();
    }
    expect(
      locationBiasFromMapUi({ ...viewportMapUi, viewport: { lat: 1000, lng: -999, zoom: 13 } }),
    ).toBeUndefined();
  });

  it("returns undefined when memory is missing, malformed or throws", async () => {
    expect(await resolveGroundingLocationBias({})).toBeUndefined();
    expect(
      await resolveGroundingLocationBias({}, { memory: { getWorkingMemory: async () => "{bad" } }),
    ).toBeUndefined();
    expect(
      await resolveGroundingLocationBias(
        {},
        { memory: { getWorkingMemory: async () => { throw new Error("unavailable"); } } },
      ),
    ).toBeUndefined();
  });
});

describe("resolveGroundingMemory", () => {
  it("uses the Mastra agent's thread-scoped memory and execution IDs", async () => {
    const getWorkingMemory = vi.fn(async () => "{}");
    const getMemory = vi.fn(async () => ({ getWorkingMemory }));
    const requestContext = { userId: "user-1" };
    const resolved = await resolveGroundingMemory({
      mastra: { getAgentById: () => ({ getMemory }) },
      agent: {
        agentId: "concierge-agent",
        threadId: "thread-1",
        resourceId: "user-1",
      },
      requestContext,
    });
    expect(getMemory).toHaveBeenCalledWith({ requestContext });
    expect(resolved).toMatchObject({
      memory: { getWorkingMemory },
      threadId: "thread-1",
      resourceId: "user-1",
    });
  });

  it("does not invent memory when the agent has none", async () => {
    expect(await resolveGroundingMemory({ agent: { agentId: "unknown" } })).toEqual({});
  });
});
