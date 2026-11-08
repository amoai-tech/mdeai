import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../lib/google-places-cafe-search", () => ({
  searchGoogleCafes: vi.fn().mockResolvedValue({ results: [], attribution: [] }),
  withMedellinScope: (query: string) => `${query} Medellín, Colombia`,
}));

vi.mock("../../lib/adk-grounding-client", () => ({
  invokeAdkGrounding: vi.fn(),
}));

vi.mock("../../lib/grounding-quota", () => ({
  incrementAndCheckGroundingQuota: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("../../lib/grounding-location-bias", () => ({
  resolveGroundingLocationBias: vi.fn(({ locationBias }) => locationBias),
}));

vi.mock("../search-restaurants", () => ({
  searchRestaurants: vi.fn(),
}));

vi.mock("../search-venue-anchors", () => ({
  isCoffeeVenueQuery: vi.fn((q: string) =>
    /\b(coffee|caf[eé]|espresso|specialty coffee)\b/i.test(q),
  ),
  isNightlifeVenueQuery: vi.fn(() => false),
  searchCafeVenueAnchors: vi.fn().mockResolvedValue([]),
  searchNightclubVenueAnchors: vi.fn().mockResolvedValue([]),
  venueAnchorMapsUrl: vi.fn(
    (id: string) => `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
  ),
  venueAnchorSummary: vi.fn(),
  venueAnchorToCoordinates: vi.fn(() => ({
    latitude: 6.2489,
    longitude: -75.5843,
  })),
}));

import { invokeAdkGrounding } from "../../lib/adk-grounding-client";
import { searchGoogleCafes } from "../../lib/google-places-cafe-search";
import { searchRestaurants } from "../search-restaurants";
import { searchGroundedPlacesTool } from "../search-grounded-places";
import { adkUnavailableMock } from "./grounded-places-test-helpers";

type GroundedOut = {
  results: { title?: string; placeId?: string; latitude?: number; longitude?: number; sourceMode?: string }[];
  attribution: { source: string; placeUri: string; title?: string }[];
  source: string;
  metadata?: Record<string, unknown>;
};

async function runGrounded(
  query: string,
  intent?: "cafe" | "general" | "nightlife",
): Promise<GroundedOut> {
  const out = await searchGroundedPlacesTool.execute!(
    { query, ...(intent ? { intent } : {}) },
    {} as never,
  );
  return out as GroundedOut;
}

const cafeRow = {
  id: "rst_lau_cafe_001",
  name: "Pergamino Café",
  cuisine: "cafe" as const,
  neighborhood: "Laureles",
  priceTier: "$" as const,
  avgPricePerPerson: 8,
  currency: "USD" as const,
  rating: 4.7,
  vibe: ["specialty-coffee"],
  imageUrl: "https://example.com/img.jpg",
  sourceUrl: "https://mdeai.co/restaurants/rst_lau_cafe_001",
  latitude: 6.2489,
  longitude: -75.5843,
  placeId: "ChIJtest",
  mapsUrl: "https://maps.google.com/?cid=123",
};

describe("searchGroundedPlacesTool fallback", () => {
  beforeEach(() => {
    vi.mocked(invokeAdkGrounding).mockReset();
    vi.mocked(searchRestaurants).mockReset();
    vi.mocked(searchGoogleCafes).mockReset().mockResolvedValue({ results: [], attribution: [] });
  });

  it("GM-P0-06 returns curated fallback when ADK unavailable (403)", async () => {
    vi.mocked(invokeAdkGrounding).mockResolvedValue(
      adkUnavailableMock({ reason: "adk_unavailable", status: 403 }),
    );
    vi.mocked(searchRestaurants).mockResolvedValue({
      results: [cafeRow],
      total: 1,
      source: "fallback",
    });

    const out = await runGrounded("specialty coffee Laureles");

    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0]?.title).toBe("Pergamino Café");
    expect(out.results[0]?.latitude).toBe(6.2489);
    expect(out.metadata?.fallback).toBe("curated");
    expect(out.results[0]?.sourceMode).toBe("demo_fixture");
  });

  it("returns real Google Places cafés before invoking ADK", async () => {
    vi.mocked(searchGoogleCafes).mockResolvedValue({
      results: [{
        id: "google-ChIJRituales",
        title: "Rituales Compañía de Café",
        placeId: "ChIJRituales",
        latitude: 6.2489,
        longitude: -75.5843,
        mapsUrl: "https://maps.google.com/?cid=999",
        sourceMode: "google_places",
        primaryType: "coffee_shop",
      }, {
        id: "google-ChIJBarLounge",
        title: "Café Bar & Lounge",
        placeId: "ChIJBarLounge",
        latitude: 6.25,
        longitude: -75.59,
        mapsUrl: "https://maps.google.com/?cid=1000",
        sourceMode: "google_places",
        primaryType: "coffee_shop",
      }],
      attribution: [
        { source: "Google Maps", placeUri: "https://maps.google.com/?cid=999", title: "Rituales Compañía de Café" },
        { source: "Google Maps", placeUri: "https://maps.google.com/?cid=1000", title: "Café Bar & Lounge" },
      ],
    });

    const out = await runGrounded("quiet cafés in Laureles", "cafe");

    expect(out.results[0]).toMatchObject({
      title: "Rituales Compañía de Café",
      placeId: "ChIJRituales",
      sourceMode: "google_places",
    });
    expect(out.metadata?.provider).toBe("google_places");
    expect(out.attribution).toHaveLength(1);
    expect(out.attribution[0]?.title).toBe("Rituales Compañía de Café");
    expect(searchGoogleCafes).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringMatching(/quiet cafés in Laureles Medellín, Colombia/) }),
    );
    expect(vi.mocked(searchGoogleCafes).mock.calls[0]?.[0]?.query).not.toMatch(/Exclude bar|Prefer cafés/);
    expect(invokeAdkGrounding).not.toHaveBeenCalled();
  });

  it("reports an empty Google result separately from an outage", async () => {
    vi.mocked(searchGoogleCafes).mockResolvedValue({ results: [], attribution: [] });
    vi.mocked(searchRestaurants).mockResolvedValue({ results: [], total: 0, source: "supabase" });

    const out = await runGrounded("quiet cafés in Laureles", "cafe");

    expect(out.metadata?.reason).toBe("google_places_empty");
    expect(out.metadata?.fallback).toBe("curated");
  });

  it("labels real Supabase fallback rows as saved catalog, not live Google", async () => {
    vi.mocked(invokeAdkGrounding).mockResolvedValue(
      adkUnavailableMock({ reason: "adk_unavailable", status: 503 }),
    );
    vi.mocked(searchRestaurants).mockResolvedValue({
      results: [{ ...cafeRow, rating: undefined, latitude: undefined, longitude: undefined, placeId: null, mapsUrl: null }],
      total: 1,
      source: "supabase",
    });
    const out = await runGrounded("specialty coffee Laureles");

    expect(out.results[0]).toMatchObject({
      title: "Pergamino Café",
      sourceMode: "saved_catalog",
    });
    expect(out.results[0]?.latitude).toBeUndefined();
    expect(out.results[0]?.placeId).toBeUndefined();
    expect(out.metadata?.fallback).toBe("curated");
  });

  it("GM-P2-04 returns empty results without throwing when ADK and fallback empty", async () => {
    vi.mocked(invokeAdkGrounding).mockResolvedValue(adkUnavailableMock());
    vi.mocked(searchRestaurants).mockResolvedValue({
      results: [],
      total: 0,
      source: "fallback",
    });

    const out = await runGrounded("coffee Laureles");

    expect(out.results).toEqual([]);
    expect(out.source).toBe("grounding");
  });

  it("GM-P0-07 uses restaurant coordinates in fallback rows", async () => {
    vi.mocked(invokeAdkGrounding).mockResolvedValue(adkUnavailableMock());
    vi.mocked(searchRestaurants).mockResolvedValue({
      results: [cafeRow],
      total: 1,
      source: "fallback",
    });

    const out = await runGrounded("quiet café Laureles");

    expect(out.results[0]?.placeId).toBe("ChIJtest");
    expect(out.results[0]?.longitude).toBe(-75.5843);
  });

  it("returns empty nightlife fallback without restaurant rows when anchors empty", async () => {
    const { isNightlifeVenueQuery } = await import("../search-venue-anchors");
    vi.mocked(isNightlifeVenueQuery).mockReturnValue(true);
    vi.mocked(invokeAdkGrounding).mockResolvedValue(adkUnavailableMock());

    const out = await runGrounded("salsa bars in Poblado");

    expect(out.results).toEqual([]);
    expect(out.metadata?.venueKind).toBe("nightlife");
    expect(searchRestaurants).not.toHaveBeenCalled();
  });

  it("uses nightclub anchors when intent=nightlife without nightlife keywords", async () => {
    const { searchNightclubVenueAnchors, isNightlifeVenueQuery } = await import(
      "../search-venue-anchors",
    );
    vi.mocked(isNightlifeVenueQuery).mockReturnValue(false);
    vi.mocked(searchNightclubVenueAnchors).mockResolvedValue([
      {
        id: "club-1",
        name: "VIVO Medellín",
        google_place_id: "ChIJvivo",
        neighborhood: "Provenza",
        tags: ["reggaeton"],
        summary: null,
      },
    ] as never);
    vi.mocked(invokeAdkGrounding).mockResolvedValue(adkUnavailableMock());

    const out = await runGrounded("popular venues tonight", "nightlife");

    expect(out.results[0]?.title).toBe("VIVO Medellín");
    expect(out.metadata?.venueKind).toBe("nightlife");
    expect(searchRestaurants).not.toHaveBeenCalled();
  });
});
