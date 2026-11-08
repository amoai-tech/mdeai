import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeRouteTool } from "../compute-route";

const audit = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../../lib/tool-audit-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/tool-audit-context")>();
  return { ...actual, getAuditUserId: () => audit.userId };
});
const quota = vi.hoisted(() => ({
  checkRateLimitDurable: vi.fn(async (key: string, max: number, window: number) => {
    void key; void max; void window;
    return ({
      allowed: true, count: 1, max: 100, retryAfterSeconds: 0, storeAvailable: true,
    });
  }),
}));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkRateLimitDurable: quota.checkRateLimitDurable,
}));

beforeEach(() => vi.stubEnv("GOOGLE_ROUTES_API_KEY", "test-routes-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
beforeEach(() => {
  audit.userId = null;
  quota.checkRateLimitDurable.mockClear();
  quota.checkRateLimitDurable.mockResolvedValue({
  allowed: true, count: 1, max: 100, retryAfterSeconds: 0, storeAvailable: true,
  });
});

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

  it("checks the per-user cap before consuming the shared slot", async () => {
    audit.userId = "user-1";
    quota.checkRateLimitDurable.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      routes: [{ distanceMeters: 100, duration: "60s" }],
    }), { status: 200 })));
    await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    const keys = quota.checkRateLimitDurable.mock.calls.map((call) => call[0]);
    expect(keys[0]).toMatch(/:user-1$/);
    expect(keys[1]).toMatch(/^routes-daily:/);
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
    audit.userId = null;
  });

  it("fails closed if quota storage throws rather than issuing a paid request", async () => {
    quota.checkRateLimitDurable.mockRejectedValueOnce(new Error("quota network failure"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, reason: "route_quota_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not spend quota if only a Places API key is present", async () => {
    vi.stubEnv("GOOGLE_ROUTES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-only-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, reason: "route_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(quota.checkRateLimitDurable).not.toHaveBeenCalled();
  });

  it("rejects nonnumeric daily limits instead of silently truncating them", async () => {
    vi.stubEnv("ROUTES_DAILY_LIMIT", "100garbage");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, reason: "route_quota_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a throwing RequestContext cache read as a miss", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      routes: [{ distanceMeters: 100, duration: "60s" }],
    }), { status: 200 })));
    const context = {
      requestContext: {
        get: (key: string) => {
          if (key === "mdeaiRouteToolCache") throw new Error("cache store down");
          return undefined;
        },
        set: () => {},
      },
    };
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, context as never);
    expect(out).toMatchObject({ route: { distanceMeters: 100, durationSeconds: 60 }, source: "google_routes" });
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
