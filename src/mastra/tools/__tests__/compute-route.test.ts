import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeRouteTool } from "../compute-route";

vi.mock("../../lib/google-routes-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/google-routes-client")>();
  return { ...actual, requireRoutesApiKey: () => "test-routes-key" };
});
vi.mock("../../lib/grounding-quota", () => ({
  incrementAndCheckGroundingQuota: vi.fn(async () => ({ allowed: true })),
}));

beforeEach(() => vi.stubEnv("GOOGLE_ROUTES_API_KEY", "test-routes-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("computeRouteTool", () => {
  it("returns a genuine route and attribution", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      routes: [{ distanceMeters: 5090, duration: "4506s" }],
    }), { status: 200 })));
    const out = await computeRouteTool.execute!({
      origin: { latitude: 6.2442, longitude: -75.5812 },
      destination: { address: "Provenza, Medellín" },
      travelMode: "WALK",
    }, {} as never);
    expect(out).toMatchObject({
      route: { distanceMeters: 5090, durationSeconds: 4506, travelMode: "WALK", attribution: "Google Maps" },
      source: "google_routes",
    });
  });

  it("rejects invalid input before a provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { latitude: 999, longitude: 0 },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, reason: "invalid_route_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns route:null when Google has no route", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ routes: [] }), { status: 200 })));
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, source: "google_routes", reason: "route_unavailable" });
  });
});
