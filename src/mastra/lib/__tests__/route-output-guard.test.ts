import { describe, expect, it } from "vitest";
import type { ProcessOutputStreamArgs } from "@mastra/core/processors";
import { routeUnavailableOutputGuard } from "../route-output-guard";

const part = (type: string, payload: unknown) => ({ type, payload, runId: "test", from: "AGENT" });
async function pipe(type: string, payload: unknown, state: Record<string, unknown>, text?: string) {
  return routeUnavailableOutputGuard.processOutputStream!({
    part: part(type, payload),
    state,
    streamParts: [],
    messageList: text === undefined ? undefined : {
      get: { all: { db: () => [
        { role: "user", content: { parts: [{ type: "text", text }] } },
      ] } },
    },
  } as unknown as ProcessOutputStreamArgs);
}

describe("real route-output guard", () => {
  it("replaces a failed route answer and drops every later model text chunk", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool",
      result: { source: "google_routes", route: null, reason: "route_unavailable" } }, state);
    const first = await pipe("text-delta", { text: "It takes 5 minutes" }, state);
    const second = await pipe("text-delta", { text: " or 10 minutes" }, state);
    expect(first).toMatchObject({
      type: "text-delta",
      payload: { text: "Google Maps could not calculate this route. I don't have a verified distance or travel time, so I won't guess." },
    });
    expect(second).toBeNull();
  });

  it("sends a Spanish unknown response when a Spanish route failed", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: { route: null } }, state);
    const first = await pipe("text-delta", { text: "5 minutos" }, state,
      "¿Cuánto se tarda de Laureles a Provenza?");
    expect(first).toMatchObject({ payload: { text: expect.stringContaining("no voy a inventarlos") } });
  });

  it("preserves provider-backed successful routes unchanged", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: { distanceMeters: 362, durationSeconds: 377, attribution: "Google Maps" },
    } }, state);
    const text = await pipe("text-delta", { text: "Google says 362 metres." }, state);
    expect(text).toMatchObject({ payload: { text: "Google says 362 metres." } });
  });

  it("does not touch unrelated café, booking or rental results", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "searchRestaurantsTool", result: { route: null } }, state);
    const out = await pipe("text-delta", { text: "Your booking is ready." }, state);
    expect(out).toMatchObject({ payload: { text: "Your booking is ready." } });
  });

  it("falls back to a safe English response when message snapshots fail", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "compute-route", result: { route: null } }, state);
    expect((await pipe("text-delta", { text: "Probably 10 min." }, state))?.type).toBe("text-delta");
  });
});
