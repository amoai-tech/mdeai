import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPlaceDetailsMock } = vi.hoisted(() => ({
  getPlaceDetailsMock: vi.fn(),
}));

vi.mock("@/mastra/lib/google-places-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mastra/lib/google-places-client")>();
  return { ...actual, getPlaceDetails: getPlaceDetailsMock };
});

import { PlacesRequestError } from "@/mastra/lib/google-places-client";
import { resetPlacesNegativeCacheForTests } from "@/lib/place-details-negative-cache";
import { fetchPlaceDetailsWithCache } from "@/lib/place-details-cache";

describe("place-details-cache policy (SAN-776)", () => {
  beforeEach(() => {
    resetPlacesNegativeCacheForTests();
    getPlaceDetailsMock.mockReset();
    getPlaceDetailsMock.mockResolvedValue({
      id: "ChIJTest",
      displayName: { text: "Test Café" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches fresh details on every call and never reports a DB cache hit", async () => {
    const first = await fetchPlaceDetailsWithCache("ChIJTest");
    const second = await fetchPlaceDetailsWithCache("ChIJTest");

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(false);
    expect(first.raw).toEqual({ id: "ChIJTest", displayName: { text: "Test Café" } });
    expect(getPlaceDetailsMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing negative cache for provider failures", async () => {
    getPlaceDetailsMock.mockRejectedValue(
      new PlacesRequestError("Places getPlace failed"),
    );

    await expect(fetchPlaceDetailsWithCache("ChIJNegative")).rejects.toThrow(
      PlacesRequestError,
    );
    await expect(fetchPlaceDetailsWithCache("ChIJNegative")).rejects.toThrow(
      /negative cache/i,
    );
    expect(getPlaceDetailsMock).toHaveBeenCalledTimes(1);
  });
});
