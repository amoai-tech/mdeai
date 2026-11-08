import { describe, expect, it } from "vitest";
import {
  cleanGroundingAttributionTitle,
  dedupeAttributionForDisplay,
  parseGroundedToolResult,
  resolveGroundedTitle,
  shouldShowGroundingAttribution,
} from "../parse-grounded-tool-result";

describe("resolveGroundedTitle", () => {
  it("keeps real MCP title", () => {
    expect(resolveGroundedTitle({ title: "Pausa Coffee & Brunch" }, 0, [])).toBe(
      "Pausa Coffee & Brunch",
    );
  });

  it("replaces generic Place from matching attribution index", () => {
    const mapsUrl = "https://maps.google.com/?cid=1";
    expect(
      resolveGroundedTitle(
        { title: "Place" },
        0,
        [
          {
            placeUri: mapsUrl,
            title: "Café Euge - Google Maps",
          },
        ],
        mapsUrl,
      ),
    ).toBe("Café Euge");
  });
});

describe("parseGroundedToolResult", () => {
  it("parses JSON string envelope from AG-UI", () => {
    const parsed = parseGroundedToolResult(
      JSON.stringify({
        source: "grounding",
        results: [
          {
            id: "ChIJ1",
            title: "Place",
            latitude: 6.24,
            longitude: -75.58,
            mapsUrl: "https://maps.google.com/?cid=1",
          },
        ],
        attribution: [
          {
            source: "google_maps_grounding",
            placeUri: "https://maps.google.com/?cid=1",
            title: "Botswana Café & Brunch - Google Maps",
          },
        ],
      }),
    );
    expect(parsed.results[0]?.title).toBe("Botswana Café & Brunch");
    expect(parsed.results[0]?.mapsUrl).toContain("maps.google.com");
  });

  it("preserves title and mapsUrl from grounded tool output", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [
        {
          id: "ChIJabc",
          title: "Café Namazzi",
          latitude: 6.24,
          longitude: -75.59,
          placeId: "ChIJabc",
          mapsUrl: "https://maps.google.com/?cid=99",
        },
      ],
      attribution: [
        {
          source: "google_maps_grounding",
          placeUri: "https://maps.google.com/?cid=99",
        },
      ],
    });
    expect(parsed.results[0]?.title).toBe("Café Namazzi");
    expect(parsed.results[0]?.mapsUrl).toBe("https://maps.google.com/?cid=99");
  });

  it("parses enriched fields from MAP-018B sidecar", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [
        {
          id: "ChIJabc",
          title: "Pergamino",
          latitude: 6.24,
          longitude: -75.59,
          mapsUrl: "https://maps.google.com/?cid=99",
          rating: 4.8,
          userRatingCount: 1700,
          priceLevel: "PRICE_LEVEL_MODERATE",
          openNow: true,
          photoName: "places/ChIJ/photos/x",
          fieldMaskVersion: "details-v2-mvp-2026-05-20",
        },
      ],
    });
    expect(parsed.results[0]?.rating).toBe(4.8);
    expect(parsed.results[0]?.photoName).toContain("photos/");
  });

  it("preserves provider source and rejects invented ratings/open-now/coordinates", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [{
        id: "ChIJabc",
        title: "Café in Laureles",
        sourceMode: "google_places",
        placeId: "ChIJabc",
        rating: Number.POSITIVE_INFINITY,
        openNow: "probably",
      }],
    });
    expect(parsed.results[0]?.sourceMode).toBe("google_places");
    expect(parsed.results[0]?.rating).toBeUndefined();
    expect(parsed.results[0]?.openNow).toBeUndefined();
    expect(parsed.results[0]?.latitude).toBeUndefined();
  });

  it("never promotes a curated fallback to live Google even if metadata is inconsistent", () => {
    const url = "https://maps.google.com/?cid=123";
    const parsed = parseGroundedToolResult({
      source: "grounding",
      metadata: { fallback: "curated" },
      results: [{ id: "r1", title: "Stored café", sourceMode: "google_places", mapsUrl: url }],
      attribution: [{ placeUri: url, title: "Google Place", source: "google_maps_grounding" }],
    });
    expect(parsed.results[0]?.sourceMode).toBe("saved_catalog");
    expect(parsed.results[0]?.groundingSource).toBeUndefined();
  });

  it("reads venueKind from metadata", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      metadata: { venueKind: "nightlife" },
      results: [
        {
          id: "n1",
          title: "Salsa Bar",
          latitude: 6.24,
          longitude: -75.59,
        },
      ],
    });
    expect(parsed.venueKind).toBe("nightlife");
  });
});

describe("attribution display helpers", () => {
  it("strips Google Maps suffix from attribution titles", () => {
    expect(cleanGroundingAttributionTitle("Pausa Coffee - Google Maps")).toBe(
      "Pausa Coffee",
    );
  });

  it("hides duplicate Maps links when cards already have mapsUrl", () => {
    const url = "https://maps.google.com/?cid=1";
    const deduped = dedupeAttributionForDisplay(
      [{ placeUri: url, source: "google_maps_grounding" }],
      [url],
    );
    expect(deduped).toHaveLength(0);
    expect(shouldShowGroundingAttribution([{ placeUri: url }], [url])).toBe(
      false,
    );
  });
});

// SAN-878 · GND-002 — Maps attribution ToS on grounded cards.
// A card may say "Google Maps" only when Google actually grounded it: the result's `attribution`
// carries a source whose URL equals the card's URL. Curated fallback rows never have one.
describe("grounding source (SAN-878)", () => {
  const url = "https://maps.google.com/?cid=1";
  const row = (extra: Record<string, unknown> = {}) => ({
    id: "p1",
    title: "Pausa Coffee & Brunch",
    mapsUrl: url,
    latitude: 6.24,
    longitude: -75.59,
    ...extra,
  });

  it("attaches the matching Google source to a grounded row, by URL", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [row()],
      attribution: [{ source: "google_maps_grounding", placeUri: url, title: "Pausa Coffee & Brunch" }],
    });
    expect(parsed.results[0]?.groundingSource).toEqual({ uri: url, title: "Pausa Coffee & Brunch" });
  });

  it("keeps Google's source name exactly as returned, even when it differs from the card title", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [row({ title: "Pausa Coffee" })],
      attribution: [{ placeUri: url, title: "Pausa Coffee y Brunch - Google Maps" }],
    });
    expect(parsed.results[0]?.title).toBe("Pausa Coffee");
    expect(parsed.results[0]?.groundingSource).toEqual({ uri: url, title: "Pausa Coffee y Brunch - Google Maps" });
  });

  it("gives a curated fallback row no Google source and says it is a fallback", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [row()],
      attribution: [],
      metadata: { fallback: "curated", venueKind: "cafe" },
    });
    expect(parsed.results[0]?.groundingSource).toBeUndefined();
    expect(parsed.fallback).toBe("curated");
  });

  it("never matches by position: another place's source is not attached", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [row({ id: "p2", mapsUrl: "https://maps.google.com/?cid=2" })],
      attribution: [{ placeUri: url, title: "Some Other Place" }],
    });
    expect(parsed.results[0]?.groundingSource).toBeUndefined();
  });

  it("does not manufacture a source from a record with no URL", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [row()],
      attribution: [{ source: "google_maps_grounding", title: "Pausa Coffee & Brunch" }],
    });
    expect(parsed.results[0]?.groundingSource).toBeUndefined();
  });

  it("does not attribute a row that has no URL of its own", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [row({ mapsUrl: undefined })],
      attribution: [{ placeUri: url, title: "Pausa" }],
    });
    expect(parsed.results[0]?.groundingSource).toBeUndefined();
  });

  it("does not borrow the card's name when Google's source has no name", () => {
    const parsed = parseGroundedToolResult({
      source: "grounding",
      results: [row()],
      attribution: [{ placeUri: url }, { placeUri: url, title: "   " }],
    });
    expect(parsed.results[0]?.groundingSource).toBeUndefined();
  });
});

describe("structured café amenities are not silently discarded", () => {
  it("passes provider-backed facts (including false) but drops malformed values", () => {
    const rows = parseGroundedToolResult({
      source: "grounding",
      results: [
        { id: "one", title: "Café One", wifi: false, powerOutlets: true, seating: "tables" },
        { id: "two", title: "Café Two", wifi: "very fast", seating: " " },
      ],
    }).results;
    expect(rows[0]).toMatchObject({ wifi: false, powerOutlets: true, seating: "tables" });
    expect(rows[1]?.wifi).toBeUndefined();
    expect(rows[1]?.seating).toBeUndefined();
  });
});
