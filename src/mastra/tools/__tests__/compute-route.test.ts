import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeRouteTool } from "../compute-route";
import { MDEAI_ROUTE_PLAN_KEY } from "../../lib/route-tool-choice";

const audit = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../../lib/tool-audit-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/tool-audit-context")>();
  return { ...actual, getAuditUserId: () => audit.userId };
});
const resolution = vi.hoisted(() => ({
  resolveRoutePlaceId: vi.fn(async (query: string): Promise<string | null> => `place:${query}`),
}));
vi.mock("../../lib/route-endpoint-resolution", () => ({
  resolveRoutePlaceId: resolution.resolveRoutePlaceId,
}));
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
  resolution.resolveRoutePlaceId.mockClear();
  resolution.resolveRoutePlaceId.mockImplementation(async (query: string): Promise<string | null> => `place:${query}`);
});

function planContext(plan: { origin: string; destination: string; travelMode: string }) {
  const store = new Map<string, unknown>();
  store.set(MDEAI_ROUTE_PLAN_KEY, plan);
  return {
    requestContext: {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => store.set(key, value),
    },
  };
}

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

  it("rejects a malformed per-user limit instead of silently truncating it", async () => {
    audit.userId = "user-1";
    vi.stubEnv("ROUTES_DAILY_LIMIT_PER_USER", "20garbage");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, reason: "route_quota_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(quota.checkRateLimitDurable).not.toHaveBeenCalled();
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

  it("returns a paid route when the cache write throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      routes: [{ distanceMeters: 120, duration: "90s" }],
    }), { status: 200 })));
    const context = {
      requestContext: {
        get: () => undefined,
        set: (key: string) => {
          if (key === "mdeaiRouteToolCache") throw new Error("cache write down");
        },
      },
    };
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, context as never);
    expect(out).toMatchObject({ route: { distanceMeters: 120, durationSeconds: 90 }, source: "google_routes" });
  });

  it("returns route:null when Google has no route", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ routes: [] }), { status: 200 })));
    const out = await computeRouteTool.execute!({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    }, {} as never);
    expect(out).toMatchObject({ route: null, source: "google_routes", reason: "route_unavailable" });
  });

  it("uses the user's parsed endpoints and mode instead of model-invented place IDs", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      routes: [{ distanceMeters: 714, duration: "294s" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { placeId: "ChIJC5nPIzP024QRZo05wS3p8SI" },
      destination: { placeId: "ChIJ1z6y7zJ624QRR0fKV0Lx6FI" },
      travelMode: "WALK",
    }, planContext({
      origin: "Parque Lleras",
      destination: "Provenza",
      travelMode: "DRIVE",
    }) as never);
    expect(out).toMatchObject({
      route: { distanceMeters: 714, durationSeconds: 294, travelMode: "DRIVE" },
      source: "google_routes",
    });
    expect(resolution.resolveRoutePlaceId).toHaveBeenCalledWith("Parque Lleras");
    expect(resolution.resolveRoutePlaceId).toHaveBeenCalledWith("Provenza");
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.origin).toEqual({ placeId: "place:Parque Lleras" });
    expect(body.destination).toEqual({ placeId: "place:Provenza" });
    expect(body.travelMode).toBe("DRIVE");
  });

  it("reports unavailable without calling Routes when Places cannot resolve an endpoint", async () => {
    resolution.resolveRoutePlaceId.mockResolvedValueOnce(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await computeRouteTool.execute!({
      origin: { placeId: "invented" },
      destination: { placeId: "invented" },
    }, planContext({
      origin: "Nowhere at all",
      destination: "Provenza",
      travelMode: "WALK",
    }) as never);
    expect(out).toMatchObject({ route: null, source: "google_routes", reason: "route_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(quota.checkRateLimitDurable).toHaveBeenCalledTimes(1);
  });

  it("does not spend a second Routes call or quota slot when the model repeats the same forced route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      routes: [{ distanceMeters: 362, duration: "377s" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = planContext({
      origin: "Parque Lleras",
      destination: "Provenza",
      travelMode: "WALK",
    });
    const first = await computeRouteTool.execute!({
      origin: { placeId: "invented-first" },
      destination: { placeId: "invented-first" },
    }, context as never);
    const second = await computeRouteTool.execute!({
      origin: { placeId: "invented-second" },
      destination: { placeId: "invented-second" },
      includePolyline: false,
    }, context as never);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolution.resolveRoutePlaceId).toHaveBeenCalledTimes(2);
    expect(quota.checkRateLimitDurable).toHaveBeenCalledTimes(1);
  });
});
