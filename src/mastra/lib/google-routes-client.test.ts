import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeGoogleRoute,
  parseDurationSeconds,
  parseGoogleRoute,
  RouteInputError,
} from "./google-routes-client";

const ok = {
  routes: [{
    distanceMeters: 5090,
    duration: "4506s",
    polyline: { encodedPolyline: "abc123" },
  }],
};

beforeEach(() => vi.stubEnv("GOOGLE_ROUTES_API_KEY", "test-routes-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("parseGoogleRoute", () => {
  it("parses distance, seconds and optional polyline", () => {
    expect(parseGoogleRoute(ok, "WALK", true)).toEqual({
      distanceMeters: 5090,
      durationSeconds: 4506,
      travelMode: "WALK",
      encodedPolyline: "abc123",
      attribution: "Google Maps",
    });
  });

  it("returns null for empty or malformed routes", () => {
    expect(parseGoogleRoute({ routes: [] }, "WALK")).toBeNull();
    expect(parseGoogleRoute({ routes: [{ distanceMeters: 100, duration: "fast" }] }, "WALK")).toBeNull();
    expect(parseDurationSeconds("120s")).toBe(120);
    expect(parseDurationSeconds("120")).toBeNull();
    expect(parseGoogleRoute({ routes: [null] }, "WALK")).toBeNull();
    expect(parseGoogleRoute(ok, "WALK", false)?.encodedPolyline).toBeUndefined();
  });
});

describe("computeGoogleRoute", () => {
  it("sends a real Routes request and returns parsed facts", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const route = await computeGoogleRoute({
      origin: { latitude: 6.2442, longitude: -75.5812 },
      destination: { placeId: "ChIJdestination" },
      travelMode: "WALK",
      includePolyline: true,
    });
    expect(route?.distanceMeters).toBe(5090);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({
      travelMode: "WALK",
      destination: { placeId: "ChIJdestination" },
      polylineQuality: "OVERVIEW",
    });
  });

  it("rejects out-of-range coordinates before calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(computeGoogleRoute({
      origin: { latitude: 999, longitude: 0 },
      destination: { address: "Provenza" },
    })).rejects.toBeInstanceOf(RouteInputError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes timeout/network errors to RoutesRequestError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));
    await expect(computeGoogleRoute({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    })).rejects.toMatchObject({ name: "RoutesRequestError" });
  });

  it("throws a typed error on provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(computeGoogleRoute({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    })).rejects.toMatchObject({ name: "RoutesRequestError", status: 403 });
  });
});
