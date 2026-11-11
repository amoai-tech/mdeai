import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchNearby } from "../../lib/google-places-client";
import { RENTAL_SUPABASE_KEY } from "../search-rentals";
import { MDEAI_USER_ID_KEY } from "../../lib/tool-audit-context";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import {
  hasVerifiedNearbyRentalUser,
  mapNearbyProviderPlaces,
  searchNearbyRentalPlaces,
} from "../nearby-rental-places";

vi.mock("../../lib/google-places-client", () => ({
  DEFAULT_NEARBY_SEARCH_MASK: [
    "places.id", "places.displayName", "places.googleMapsLinks",
    "places.location", "places.primaryType",
  ],
  searchNearby: vi.fn(),
}));

const RENTAL_ID = "550e8400-e29b-41d4-a716-446655440000";
const input = { rentalId: RENTAL_ID, radiusMeters: 800, limit: 5 };
const realPlace = {
  id: "ChIJCafeTest",
  displayName: { text: "Real Provider Café" },
  location: { latitude: 6.251, longitude: -75.591 },
  googleMapsLinks: { placeUri: "https://www.google.com/maps/place/Real+Provider+Cafe" },
  primaryType: "cafe",
};

function contextWithRlsRental(row: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const requestContext = {
    get: vi.fn((key: string) =>
      key === RENTAL_SUPABASE_KEY ? { from } : undefined),
  };
  return { context: { requestContext }, from, select, eq, maybeSingle };
}

describe("SAN-106 verified user guard for tool-originated Nearby", () => {
  const userId = "renter-verified";

  function authContext(auditId: string | null, user: { id: string; is_anonymous?: boolean } | null) {
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const context = {
      requestContext: {
        get: (key: string) => key === MDEAI_USER_ID_KEY ? auditId
          : key === RENTAL_SUPABASE_KEY ? { from: vi.fn(), auth: { getUser } }
            : undefined,
      },
    };
    return { context, getUser };
  }

  it("accepts only the server-derived identity matching a non-anonymous RLS client", async () => {
    const { context, getUser } = authContext(userId, { id: userId, is_anonymous: false });
    expect(await hasVerifiedNearbyRentalUser(context)).toBe(true);
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("rejects missing identity or a service bearer without Supabase user credentials", async () => {
    const missing = authContext(null, { id: userId, is_anonymous: false });
    expect(await hasVerifiedNearbyRentalUser(missing.context)).toBe(false);
    expect(missing.getUser).not.toHaveBeenCalled();
    expect(await hasVerifiedNearbyRentalUser({ requestContext: { get: (key: string) =>
      key === MDEAI_USER_ID_KEY ? userId : undefined } })).toBe(false);
  });

  it("rejects anonymous Supabase identities, forged IDs, and auth errors", async () => {
    expect(await hasVerifiedNearbyRentalUser(
      authContext(userId, { id: userId, is_anonymous: true }).context,
    )).toBe(false);
    expect(await hasVerifiedNearbyRentalUser(
      authContext(userId, { id: "different-renter", is_anonymous: false }).context,
    )).toBe(false);
    expect(await hasVerifiedNearbyRentalUser(
      authContext(userId, null).context,
    )).toBe(false);
  });
});

describe("SAN-106 RLS-backed rental Nearby → existing grounded pins", () => {
  beforeEach(() => {
    vi.mocked(searchNearby).mockReset();
    vi.mocked(searchNearby).mockResolvedValue({ places: [realPlace] });
  });

  it("queries Google Places using only RLS-visible stored coordinates and the exact mask", async () => {
    const { context, from, select, eq } = contextWithRlsRental({
      id: RENTAL_ID, latitude: 6.2503288, longitude: -75.5915126,
    });
    const out = await searchNearbyRentalPlaces(input, context);
    expect(from).toHaveBeenCalledWith("apartments");
    expect(select).toHaveBeenCalledWith("id, latitude, longitude");
    expect(eq).toHaveBeenCalledWith("id", RENTAL_ID);
    expect(searchNearby).toHaveBeenCalledWith({
      locationRestriction: {
        circle: { center: { latitude: 6.2503288, longitude: -75.5915126 }, radius: 800 },
      },
      includedTypes: ["cafe", "coffee_shop"],
      rankPreference: "DISTANCE",
      pageSize: 5,
      fieldMask: ["places.id", "places.displayName", "places.googleMapsLinks", "places.location", "places.primaryType"],
    });
    expect(out.metadata).toMatchObject({
      searchMode: "nearby",
      anchorPinId: `rental-${RENTAL_ID}`,
      venueKind: "cafe",
      provider: "google_places_nearby",
    });
    expect(out.results).toEqual([{
      id: "ChIJCafeTest",
      title: "Real Provider Café",
      latitude: 6.251,
      longitude: -75.591,
      placeId: "ChIJCafeTest",
      sourceMode: "google_places",
      mapsUrl: "https://www.google.com/maps/place/Real+Provider+Cafe",
      primaryType: "cafe",
    }]);
    expect(out.attribution).toHaveLength(1);
    const { pins } = normalizeToolOutput("grounded", out);
    expect(pins).toMatchObject([{
      id: "grounded-ChIJCafeTest",
      category: "grounded",
      source: "places",
      lat: 6.251,
      lng: -75.591,
      title: "Real Provider Café",
      placeId: "ChIJCafeTest",
    }]);
  });

  it("never requests Places for missing, private or coordinate-less rentals", async () => {
    const { context } = contextWithRlsRental(null);
    const missing = await searchNearbyRentalPlaces(input, context);
    expect(missing.results).toEqual([]);
    expect(missing.metadata.reason).toBe("rental_has_no_accessible_coordinates");
    const noGeo = contextWithRlsRental({ id: RENTAL_ID, latitude: null, longitude: null });
    expect((await searchNearbyRentalPlaces(input, noGeo.context)).results).toEqual([]);
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("does not skip RLS or call Places after a rental lookup error", async () => {
    const { context } = contextWithRlsRental(null, { message: "permission denied" });
    const out = await searchNearbyRentalPlaces(input, context);
    expect(out.metadata.reason).toBe("rental_lookup_unavailable");
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("rejects an invalid radius or listing ID before calling the DB/provider", async () => {
    const { context, from } = contextWithRlsRental({ id: RENTAL_ID, latitude: 6.25, longitude: -75.59 });
    for (const query of [
      { ...input, rentalId: "not-a-real-rental" },
      { ...input, rentalId: "a".repeat(100_000) },
      { ...input, radiusMeters: 90000 },
      { ...input, limit: 100 },
    ]) {
      const out = await searchNearbyRentalPlaces(query, context);
      expect(out.metadata.reason).toBe("invalid_nearby_request");
    }
    expect(from).not.toHaveBeenCalled();
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("returns honest empty results if the Places provider fails", async () => {
    const { context } = contextWithRlsRental({ id: RENTAL_ID, latitude: 6.25, longitude: -75.59 });
    vi.mocked(searchNearby).mockRejectedValue(new Error("Places unavailable"));
    const out = await searchNearbyRentalPlaces(input, context);
    expect(out.results).toEqual([]);
    expect(out.metadata.reason).toBe("nearby_provider_unavailable");
  });

  it("accepts only exact HTTPS Google Maps hosts with the correct path", () => {
    const candidates = [
      "https://www.google.com/maps/place/Test",
      "https://google.com/maps?cid=123",
      "https://maps.google.com/?cid=123",
    ];
    for (const mapsUrl of candidates) {
      expect(mapNearbyProviderPlaces({ places: [{ ...realPlace, googleMapsLinks: { placeUri: mapsUrl } }] })[0]?.mapsUrl).toBe(mapsUrl);
    }
    for (const mapsUrl of [
      "https://google.evil.example/maps",
      "https://www.google.com.evil.example/maps",
      "https://maps.google.evil.example/?cid=123",
      "https://google.com/maps.evil.example/path",
      "https://google.com.evil.example/maps",
      "https://www.google.com@evil.example/maps",
      "http://www.google.com/maps/place/Test",
      "https://www.google.com/search?q=cafe",
      "not a valid URL",
    ]) {
      const mapped = mapNearbyProviderPlaces({
        places: [{ ...realPlace, googleMapsLinks: { placeUri: mapsUrl } }],
      });
      expect(mapped).toHaveLength(1);
      expect(mapped[0]?.mapsUrl).toBeUndefined();
    }
  });

  it("drops fabricated, incomplete, bad-coordinate and duplicate provider rows", () => {
    const mapped = mapNearbyProviderPlaces({
      places: [
        realPlace,
        realPlace,
        { ...realPlace, id: "ChIJBad", location: { latitude: 91, longitude: 0 } },
        { ...realPlace, id: "", displayName: { text: "Fake" } },
        { ...realPlace, id: "ChIJNoName", displayName: { text: "" } },
        { ...realPlace, id: "ChIJNoCoord", location: null },
      ],
    });
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.id).toBe("ChIJCafeTest");
  });
});
