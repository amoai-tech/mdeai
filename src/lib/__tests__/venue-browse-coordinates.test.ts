import { describe, expect, it } from "vitest";
import { venueAnchorToCoordinates, type VenueAnchorRow } from "@/mastra/tools/search-venue-anchors";
import { mapVenueAnchorToCafeListing } from "@/lib/cafe-browse";
import { mapVenueAnchorToNightlifeListing } from "@/lib/nightlife-browse";

const row = (over: Partial<VenueAnchorRow> = {}): VenueAnchorRow => ({
  id: "v1", kind: "cafe", name: "Pergamino", google_place_id: "ChIJ1", neighborhood: "Laureles",
  latitude: 6.2489, longitude: -75.5843, tags: [], metadata: null, ...over,
});

describe("SAN-1146 venue coordinates are real or absent, never a placeholder", () => {
  it("returns the saved coordinates, including numeric strings from the database", () => {
    expect(venueAnchorToCoordinates(row())).toEqual({ latitude: 6.2489, longitude: -75.5843 });
    expect(venueAnchorToCoordinates(row({ latitude: "6.25", longitude: "-75.58" })))
      .toEqual({ latitude: 6.25, longitude: -75.58 });
  });

  it("returns null, not the old city-center point (6.2442, -75.5812), when coordinates are missing, partial or out of range", () => {
    const none = { latitude: null, longitude: null };
    expect(venueAnchorToCoordinates(row({ latitude: null, longitude: null }))).toEqual(none);
    expect(venueAnchorToCoordinates(row({ longitude: null }))).toEqual(none);
    expect(venueAnchorToCoordinates(row({ latitude: 91 }))).toEqual(none);
    expect(venueAnchorToCoordinates(row({ longitude: "abc" }))).toEqual(none);
  });

  it("café and nightlife listings keep the same real coordinates, or null", () => {
    expect(mapVenueAnchorToCafeListing(row())).toMatchObject({ id: "v1", latitude: 6.2489, longitude: -75.5843 });
    expect(mapVenueAnchorToNightlifeListing(row({ kind: "nightclub" }))).toMatchObject({ latitude: 6.2489, longitude: -75.5843 });
    expect(mapVenueAnchorToCafeListing(row({ latitude: null, longitude: null })))
      .toMatchObject({ latitude: null, longitude: null });
    expect(mapVenueAnchorToNightlifeListing(row({ latitude: null, longitude: null })))
      .toMatchObject({ latitude: null, longitude: null });
  });
});
