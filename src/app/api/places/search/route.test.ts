import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlacesConfigError, PlacesRequestError } from "@/mastra/lib/google-places-client";
import { resetPlacesSearchRateLimitsForTests } from "@/lib/places-search-rate-limit";

const { searchRentalAddresses } = vi.hoisted(() => ({ searchRentalAddresses: vi.fn() }));

vi.mock("@/lib/place-search", () => ({ searchRentalAddresses }));

import { GET } from "./route";

const URL_OK = "http://localhost/api/places/search?q=calle+10+laureles";

describe("GET /api/places/search", () => {
  beforeEach(() => {
    resetPlacesSearchRateLimitsForTests();
    searchRentalAddresses.mockReset();
  });

  it("returns 400 for a too-short query", async () => {
    const res = await GET(new Request("http://localhost/api/places/search?q=abc"));
    expect(res.status).toBe(400);
  });

  it("returns normalized provider results", async () => {
    const results = [
      { placeId: "ChIJabc12345", displayName: "Calle 10", formattedAddress: "Calle 10, Laureles", latitude: 6.24, longitude: -75.59 },
    ];
    searchRentalAddresses.mockResolvedValue(results);
    const res = await GET(new Request(URL_OK));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results });
  });

  it("maps PlacesConfigError to 503", async () => {
    searchRentalAddresses.mockRejectedValue(new PlacesConfigError("missing key"));
    const res = await GET(new Request(URL_OK));
    expect(res.status).toBe(503);
  });

  it("maps PlacesRequestError to 502", async () => {
    searchRentalAddresses.mockRejectedValue(new PlacesRequestError("upstream"));
    const res = await GET(new Request(URL_OK));
    expect(res.status).toBe(502);
  });

  it("rate limits after 30 requests from one IP", async () => {
    searchRentalAddresses.mockResolvedValue([]);
    const req = new Request(URL_OK, { headers: { "x-forwarded-for": "san468-route-test" } });
    for (let i = 0; i < 30; i += 1) {
      const res = await GET(req);
      expect(res.status).toBe(200);
    }
    const blocked = await GET(req);
    expect(blocked.status).toBe(429);
  });
});
