import { describe, expect, it } from "vitest";
import { normalizePlaceSearchResponse, normalizeVerifiedPlace } from "@/lib/place-search";

describe("normalizePlaceSearchResponse", () => {
  it("normalizes provider fields without inventing any", () => {
    const results = normalizePlaceSearchResponse({
      places: [
        {
          id: "ChIJabc12345",
          displayName: { text: "Calle 10 #42-15" },
          formattedAddress: "Calle 10 #42-15, Laureles, Medellín",
          location: { latitude: 6.2447, longitude: -75.5916 },
        },
      ],
    });
    expect(results).toEqual([
      {
        placeId: "ChIJabc12345",
        displayName: "Calle 10 #42-15",
        formattedAddress: "Calle 10 #42-15, Laureles, Medellín",
        latitude: 6.2447,
        longitude: -75.5916,
      },
    ]);
  });

  it("drops entries that have no provider place id", () => {
    expect(
      normalizePlaceSearchResponse({
        places: [{ formattedAddress: "no id" }, { id: "ChIJkeep1234" }],
      }).map((r) => r.placeId),
    ).toEqual(["ChIJkeep1234"]);
  });

  it("keeps null coordinates rather than fabricating them", () => {
    const [result] = normalizePlaceSearchResponse({ places: [{ id: "ChIJnull1234" }] });
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("normalizes a verified place and keeps missing coordinates null", () => {
    expect(
      normalizeVerifiedPlace({
        id: "ChIJxyz98765",
        formattedAddress: "Calle 10 #42-15, Laureles",
        location: { latitude: 6.2447, longitude: -75.5916 },
      }),
    ).toEqual({
      placeId: "ChIJxyz98765",
      formattedAddress: "Calle 10 #42-15, Laureles",
      latitude: 6.2447,
      longitude: -75.5916,
    });
    expect(normalizeVerifiedPlace({ formattedAddress: "no id" })).toBeNull();
    expect(normalizeVerifiedPlace({ id: "ChIJxyz98765" })?.latitude).toBeNull();
  });

  it("returns [] for malformed payloads", () => {
    expect(normalizePlaceSearchResponse(null)).toEqual([]);
    expect(normalizePlaceSearchResponse("nope")).toEqual([]);
    expect(normalizePlaceSearchResponse({ places: "nope" })).toEqual([]);
  });
});
