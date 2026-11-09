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

  it("does not let a memory update re-enable an estimated ETA", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: null, reason: "route_unavailable",
    } }, state);
    await pipe("tool-result", { toolName: "updateWorkingMemory", result: { ok: true } }, state);
    const out = await pipe("text-delta", { text: "It takes about 10 minutes." }, state);
    expect(out).toMatchObject({
      payload: { text: expect.stringContaining("could not calculate this route") },
    });
  });

  it("builds the walking answer from Google's numbers and drops model embellishment", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: {
        distanceMeters: 362,
        durationSeconds: 377,
        travelMode: "WALK",
        warning: "Walking routes may omit sidewalks or pedestrian paths. Use caution.",
        attribution: "Google Maps",
      },
    } }, state);
    const first = await pipe("text-delta", { text: "It is 362 m along Calle 70 in 5 minutes." }, state);
    expect(first).toMatchObject({
      payload: {
        text: "Google Maps: 362 m, about 6 minutes walking. Walking routes may omit sidewalks or pedestrian paths. Use caution.",
      },
    });
    expect(await pipe("text-delta", { text: " And it is a lovely walk." }, state)).toBeNull();
  });

  it("keeps every successful route in a multi-route turn", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: { distanceMeters: 361, durationSeconds: 371, travelMode: "WALK", attribution: "Google Maps" },
    } }, state);
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: { distanceMeters: 6269, durationSeconds: 5477, travelMode: "WALK", attribution: "Google Maps" },
    } }, state);
    const text = await pipe("text-delta", { text: "Here are the routes." }, state);
    const rendered = (text as { payload: { text: string } }).payload.text;
    expect(rendered).toContain("Google Maps: 361 m, about 6 minutes walking.");
    expect(rendered).toContain("Google Maps: 6.3 km, about 91 minutes walking.");
  });

  it("uses the Spanish route wording and caution from the provider result", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: {
        distanceMeters: 6269,
        durationSeconds: 5477,
        travelMode: "WALK",
        warning: "Walking routes may omit sidewalks or pedestrian paths. Use caution.",
        attribution: "Google Maps",
      },
    } }, state);
    const first = await pipe("text-delta", { text: "Son 5 minutos." }, state, "¿Cuánto se tarda de Laureles a Provenza?");
    expect(first).toMatchObject({
      payload: {
        text: "Google Maps: 6.3 km, unos 91 minutos a pie. Las rutas a pie pueden omitir aceras o senderos peatonales; ten cuidado.",
      },
    });
  });

  it("reports a driving route in minutes without a walking caution", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: { distanceMeters: 440, durationSeconds: 221, travelMode: "DRIVE", attribution: "Google Maps" },
    } }, state);
    const first = await pipe("text-delta", { text: "About 5 minutes by car." }, state);
    expect(first).toMatchObject({ payload: { text: "Google Maps: 440 m, about 4 minutes driving." } });
  });

  it("keeps a separate answer after a successful route and later café search", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: { distanceMeters: 362, durationSeconds: 377, travelMode: "WALK", attribution: "Google Maps" },
    } }, state);
    await pipe("tool-result", { toolName: "searchRestaurantsTool", result: { results: [{ id: "cafe-1" }] } }, state);
    const out = await pipe("text-delta", { text: "Café A is one result." }, state);
    expect(out).toMatchObject({ payload: { text: "Café A is one result." } });
  });

  it("does not touch unrelated café, booking or rental results", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "searchRestaurantsTool", result: { route: null } }, state);
    const out = await pipe("text-delta", { text: "Your booking is ready." }, state);
    expect(out).toMatchObject({ payload: { text: "Your booking is ready." } });
  });

  it("preserves answers from new-project and booking tools after a failed route", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: { route: null, reason: "route_unavailable" } }, state);
    await pipe("tool-result", { toolName: "searchNewProjectsTool", result: { results: [{ id: "np-1" }] } }, state);
    const out = await pipe("text-delta", { text: "Here is a new project." }, state);
    expect(out).toMatchObject({ payload: { text: "Here is a new project." } });

    const bookingState = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: { route: null } }, bookingState);
    await pipe("tool-result", { toolName: "requestVenueBooking", result: { status: "proposed" } }, bookingState);
    const booking = await pipe("text-delta", { text: "Your booking proposal is ready." }, bookingState);
    expect(booking).toMatchObject({ payload: { text: "Your booking proposal is ready." } });
  });

  it("preserves an unrelated answer after a failed route and later café search", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool", result: {
      route: null, reason: "route_unavailable",
    } }, state, "How far is Provenza from Parque Lleras, and find cafés there?");
    await pipe("tool-result", { toolName: "searchRestaurantsTool", result: {
      results: [{ id: "cafe-1", title: "Café A" }],
    } }, state);
    const first = await pipe("text-delta", { text: "Café A is one result." }, state);
    const second = await pipe("text-delta", { text: " Google Maps route is unavailable." }, state);
    expect(first).toMatchObject({ payload: { text: "Café A is one result." } });
    expect(second).toMatchObject({
      payload: { text: " Google Maps route is unavailable." },
    });
  });

  it.each([
    ["route_quota_per_user_exceeded", "your daily route-request limit"],
    ["route_quota_exceeded", "Today's route-request limit"],
    ["route_quota_unavailable", "temporarily unavailable"],
    ["route_quota_disabled", "temporarily unavailable"],
    ["invalid_route_request", "valid starting and destination locations"],
  ])("does not mislabel %s as a Google Maps failure", async (reason, expected) => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool",
      result: { route: null, reason } }, state);
    const answer = await pipe("text-delta", { text: "It takes 5 minutes" }, state);
    expect(answer).toMatchObject({ payload: { text: expect.stringContaining(expected) } });
    expect((answer as {payload:{text:string}}).payload.text).not.toContain("Google Maps could not calculate");
  });

  it("uses Spanish quota messaging after a provider limit", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "computeRouteTool",
      result: { route: null, reason: "route_quota_exceeded" } }, state);
    const answer = await pipe("text-delta", { text: "Son 5 minutos" }, state,
      "¿Cuánto se tarda de Laureles a Provenza?");
    expect(answer).toMatchObject({ payload: { text: expect.stringContaining("límite diario") } });
  });

  it("falls back to a safe English response when message snapshots fail", async () => {
    const state = {};
    await pipe("tool-result", { toolName: "compute-route", result: { route: null } }, state);
    expect((await pipe("text-delta", { text: "Probably 10 min." }, state))?.type).toBe("text-delta");
  });
});
