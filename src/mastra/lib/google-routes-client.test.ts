import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeGoogleRoute,
  parseDurationSeconds,
  parseGoogleRoute,
  RoutesRequestError,
} from "./google-routes-client";

const ok = {
  routes: [{
    distanceMeters: 5090,
    duration: "4506s",
    polyline: { encodedPolyline: "abc123" },
  }],
};

vi.mock("./google-places-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-places-client")>();
  return { ...actual, requirePlacesApiKey: () => "test-routes-key" };
});

afterEach(() => vi.unstubAllGlobals());

describe("parseGoogleRoute", () => {
  it("parses distance, seconds and optional polyline", () => {
    expect(parseGoogleRoute(ok, "WALK")).toEqual({
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
    })).rejects.toBeInstanceOf(RoutesRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a typed error on provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(computeGoogleRoute({
      origin: { address: "Laureles" },
      destination: { address: "Provenza" },
    })).rejects.toMatchObject({ name: "RoutesRequestError", status: 403 });
  });
});
