import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeRouteTool } from "../compute-route";

vi.mock("../../lib/google-routes-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/google-routes-client")>();
  return { ...actual, requireRoutesApiKey: () => "test-routes-key" };
});
const quota = vi.hoisted(() => ({
  checkRateLimitDurable: vi.fn(async () => ({
    allowed: true, count: 1, max: 100, retryAfterSeconds: 0, storeAvailable: true,
  })),
}));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkRateLimitDurable: quota.checkRateLimitDurable,
}));

beforeEach(() => vi.stubEnv("GOOGLE_ROUTES_API_KEY", "test-routes-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
beforeEach(() => quota.checkRateLimitDurable.mockResolvedValue({
  allowed: true, count: 1, max: 100, retryAfterSeconds: 0, storeAvailable: true,
}));

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

  it("uses a separate Routes budget and blocks when exhausted", async () => {
    quota.checkRateLimitDurable.mockResolvedValueOnce({
      allowed: false, count: 100, max: 100, retryAfterSeconds: 3600, storeAvailable: true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, reason: "route_quota_exceeded" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(quota.checkRateLimitDurable).toHaveBeenCalledWith(
      expect.stringMatching(/^routes-daily:/), 100, 86400,
    );
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
