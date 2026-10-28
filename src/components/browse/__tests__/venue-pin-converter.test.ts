import { describe, expect, it } from "vitest";
import { venueToMapPin } from "@/lib/browse/browse-pin-converters";

const cafe = {
  id: "e932ab22-4036-4db9-bca7-52f860d9ad1a",
  name: "Café del Parque",
  neighborhood: "Laureles",
  latitude: 6.244,
  longitude: -75.589,
  mapsUrl: "https://maps.google.com/?q=cafe",
  summary: "Specialty coffee and workspace.",
};

describe("SAN-1146 real venue pins", () => {
  it("maps only actual stored coordinates to the canonical venue pin id", () => {
    expect(venueToMapPin(cafe)).toMatchObject({
      id: "venue-" + cafe.id, category: "venue", lat: 6.244, lng: -75.589,
      title: cafe.name, subtitle: "Laureles", source: "sql",
      meta: { summary: cafe.summary },
    });
  });

  it("refuses missing, partial, out-of-range or nonfinite coordinates", () => {
    for (const v of [
      { latitude: null }, { longitude: null }, { latitude: null, longitude: null },
      { latitude: 100 }, { longitude: -200 }, { latitude: Number.NaN },
      { longitude: Number.POSITIVE_INFINITY },
    ]) expect(venueToMapPin({ ...cafe, ...v })).toBeNull();
  });

  it("does not convert an invalid Maps URL into a false pin or fabricated link", () => {
    const pin = venueToMapPin({ ...cafe, mapsUrl: "invalid" });
    expect(pin?.placeUri).toBeUndefined();
    expect(pin?.id).toBe("venue-" + cafe.id);
    const unsafe = venueToMapPin({ ...cafe, mapsUrl: "javascript:alert(1)" });
    expect(unsafe?.id).toBe("venue-" + cafe.id);
    expect(unsafe?.placeUri).toBeUndefined();
  });
});
