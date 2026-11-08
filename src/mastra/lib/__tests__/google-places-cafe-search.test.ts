import { describe, expect, it, vi } from "vitest";

const { searchTextMock } = vi.hoisted(() => ({ searchTextMock: vi.fn() }));
vi.mock("../google-places-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../google-places-client")>();
  return { ...actual, searchText: searchTextMock };
});

import { mapGoogleTextSearchToGrounded, searchGoogleCafes, withMedellinScope } from "../google-places-cafe-search";

const response = {
  places: [
    {
      id: "ChIJPergamino",
      displayName: { text: "Pergamino Café" },
      location: { latitude: 6.2489, longitude: -75.5843 },
      googleMapsLinks: {
        placeUri: "https://maps.google.com/?cid=123",
        directionsUri: "https://www.google.com/maps/dir/?api=1&destination=6.2489,-75.5843",
        reviewsUri: "https://www.google.com/maps/place/?q=place_id:ChIJPergamino",
      },
      primaryType: "coffee_shop",
    },
    {
      id: "ChIJBrandOnly",
      displayName: { text: "Rituales" },
      primaryType: "cafe",
      googleMapsLinks: { placeUri: "https://maps.google.com/?cid=456" },
    },
    {
      id: "ChIJBar",
      displayName: { text: "Skybar" },
      primaryType: "bar",
      googleMapsLinks: { placeUri: "https://maps.google.com/?cid=789" },
    },
  ],
};

describe("mapGoogleTextSearchToGrounded", () => {
  it("keeps real Place IDs, coordinates, links and café source", () => {
    const out = mapGoogleTextSearchToGrounded(response);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({
      id: "google-ChIJPergamino",
      title: "Pergamino Café",
      placeId: "ChIJPergamino",
      latitude: 6.2489,
      longitude: -75.5843,
      sourceMode: "google_places",
      primaryType: "coffee_shop",
    });
    expect(out.attribution[0]).toMatchObject({ source: "Google Maps", title: "Pergamino Café" });
  });

  it("keeps brand-only cafés typed by the provider", () => {
    const out = mapGoogleTextSearchToGrounded(response);
    expect(out.results.map((r) => r.title)).toContain("Rituales");
  });

  it("omits coordinates when the provider supplied none", () => {
    const out = mapGoogleTextSearchToGrounded(response);
    const brand = out.results.find((r) => r.placeId === "ChIJBrandOnly");
    expect(brand?.latitude).toBeUndefined();
    expect(brand?.longitude).toBeUndefined();
  });

  it("adds Medellín and a default bias when the query names no city", async () => {
    searchTextMock.mockResolvedValue({ places: [] });
    await searchGoogleCafes({ query: "quiet cafés" });
    expect(searchTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        textQuery: expect.stringContaining("Medellín"),
        locationBias: {
          circle: { center: { latitude: 6.2442, longitude: -75.5812 }, radius: 5000 },
        },
      }),
    );
    expect(withMedellinScope("cafés in Laureles")).toBe("cafés in Laureles");
  });

  it("drops bars and malformed provider payloads", () => {
    const out = mapGoogleTextSearchToGrounded({
      places: [
        ...response.places,
        { id: "ChIJBadUrl", displayName: { text: "Bad URL" }, googleMapsLinks: { placeUri: "javascript:alert(1)" } },
        { id: "", displayName: { text: "No ID" } },
        { id: "ChIJRestaurant", displayName: { text: "Not a Café" }, primaryType: "restaurant", types: ["restaurant"], googleMapsLinks: { placeUri: "https://maps.google.com/?cid=321" } },
        { id: "ChIJBarType", displayName: { text: "Bar With Cafe Name" }, primaryType: "restaurant", types: ["restaurant", "bar"], googleMapsLinks: { placeUri: "https://maps.google.com/?cid=322" } },
      ],
    });
    expect(out.results.map((r) => r.title)).not.toContain("Skybar");
    expect(out.results.map((r) => r.title)).not.toContain("Bad URL");
    expect(out.results.map((r) => r.title)).not.toContain("No ID");
    expect(out.results.map((r) => r.title)).not.toContain("Not a Café");
    expect(out.results.map((r) => r.title)).not.toContain("Bar With Cafe Name");
  });
});
