import { describe, expect, it } from "vitest";
import { normalizeToolOutput } from "../normalize-tool-output";

describe("normalizeToolOutput", () => {
  it("maps rental tool rows with coordinates to pins", () => {
    const { pins, resultCount } = normalizeToolOutput("rental", {
      results: [
        {
          id: "apt-1",
          title: "Laureles loft",
          neighborhood: "Laureles",
          latitude: 6.252,
          longitude: -75.591,
        },
        {
          id: "apt-2",
          title: "No coords",
          neighborhood: "Centro",
        },
      ],
      source: "mock",
    });
    expect(resultCount).toBe(2);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.category).toBe("rental");
    expect(pins[0]?.id).toBe("rental-apt-1");
  });

  it("returns empty for invalid envelope", () => {
    expect(normalizeToolOutput("event", null).pins).toEqual([]);
  });

  it("maps grounded tool rows with mapsUrl to pins", () => {
    const { pins } = normalizeToolOutput("grounded", {
      source: "grounding",
      results: [
        {
          id: "ChIJabc",
          title: "Pausa Coffee & Brunch",
          latitude: 6.246,
          longitude: -75.589,
          placeId: "ChIJabc",
          mapsUrl: "https://maps.google.com/?cid=123",
        },
      ],
    });
    expect(pins).toHaveLength(1);
    expect(pins[0]?.category).toBe("grounded");
    expect(pins[0]?.source).toBe("grounding");
    expect(pins[0]?.title).toBe("Pausa Coffee & Brunch");
    expect(pins[0]?.placeUri).toBe("https://maps.google.com/?cid=123");
  });

  it("maps grounded rows with generic Place title via attribution", () => {
    const { pins } = normalizeToolOutput("grounded", {
      source: "grounding",
      results: [
        {
          id: "ChIJabc",
          title: "Place",
          latitude: 6.246,
          longitude: -75.589,
          mapsUrl: "https://maps.google.com/?cid=123",
        },
      ],
      attribution: [
        {
          source: "google_maps_grounding",
          placeUri: "https://maps.google.com/?cid=123",
          title: "Pausa Coffee & Brunch - Google Maps",
        },
      ],
    });
    expect(pins[0]?.title).toBe("Pausa Coffee & Brunch");
  });

  it("keeps catalog and demo pin provenance instead of calling them grounding", () => {
    const result = {
      source: "grounding",
      metadata: { fallback: "curated" },
      attribution: [],
      results: [
        { id: "catalog-1", title: "Saved Café", sourceMode: "saved_catalog", latitude: 6.24, longitude: -75.58 },
        { id: "demo-1", title: "Test Café", sourceMode: "demo_fixture", latitude: 6.25, longitude: -75.59 },
        { id: "missing", title: "No verified location", sourceMode: "saved_catalog" },
      ],
    };
    const { pins } = normalizeToolOutput("grounded", result);
    expect(pins.map((pin) => [pin.id, pin.source, pin.meta?.sourceMode])).toEqual([
      ["grounded-catalog-1", "sql", "saved_catalog"],
      ["grounded-demo-1", "mock", "demo_fixture"],
    ]);
  });

  it("maps enriched grounded rows into pin meta", () => {
    const { pins } = normalizeToolOutput("grounded", {
      source: "grounding",
      results: [
        {
          id: "ChIJabc",
          title: "Pergamino",
          latitude: 6.246,
          longitude: -75.589,
          formattedAddress: "Cra 77 #33, Laureles",
          rating: 4.8,
          userRatingCount: 120,
          photoName: "places/ChIJ/photos/x",
          openNow: false,
        },
      ],
    });
    expect(pins[0]?.subtitle).toBe("Cra 77 #33, Laureles");
    expect(pins[0]?.meta?.rating).toBe(4.8);
    expect(pins[0]?.meta?.photoName).toContain("photos/");
  });
});
