import { describe, expect, it } from "vitest";
import { mapGoogleTextSearchToGrounded } from "../google-places-cafe-search";

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

  it("drops bars and malformed provider payloads", () => {
    const out = mapGoogleTextSearchToGrounded({
      places: [
        ...response.places,
        { id: "ChIJBadUrl", displayName: { text: "Bad URL" }, googleMapsLinks: { placeUri: "javascript:alert(1)" } },
        { id: "", displayName: { text: "No ID" } },
      ],
    });
    expect(out.results.map((r) => r.title)).not.toContain("Skybar");
    expect(out.results.map((r) => r.title)).toContain("Bad URL");
    expect(out.results.find((r) => r.title === "Bad URL")?.mapsUrl).toBeUndefined();
    expect(out.results.map((r) => r.title)).not.toContain("No ID");
  });
});
