import { describe, expect, it } from "vitest";
import { restaurantToMapPin } from "@/lib/browse/browse-pin-converters";

/**
 * SAN-1468 checkpoints 1.7 — the restaurant pin converter must reject the same
 * invalid coordinates `rentalToMapPin` already rejects, instead of pushing a
 * malformed marker into the shared map (lat 99, Infinity, NaN).
 */
describe("restaurantToMapPin — schema validation", () => {
  const real = {
    id: "fc6031d7-dcf6-44c3-9547-f7172c37ee95",
    name: "El Cielo",
    neighborhood: "El Poblado",
    latitude: 6.2098,
    longitude: -75.5663,
    placeId: "ChIJ_abc",
    mapsUrl: "https://maps.google.com/?cid=123",
  };

  it("keeps a real catalog pin with its canonical id and maps link", () => {
    const pin = restaurantToMapPin(real);
    expect(pin?.id).toBe(`restaurant-${real.id}`);
    expect(pin).toMatchObject({
      category: "restaurant",
      lat: 6.2098,
      lng: -75.5663,
      title: "El Cielo",
      placeId: "ChIJ_abc",
      source: "sql",
    });
  });

  it("drops a pin with out-of-range or non-finite coordinates", () => {
    expect(restaurantToMapPin({ ...real, latitude: 99 })).toBeNull();
    expect(restaurantToMapPin({ ...real, longitude: 999 })).toBeNull();
    expect(restaurantToMapPin({ ...real, latitude: Number.POSITIVE_INFINITY })).toBeNull();
    expect(restaurantToMapPin({ ...real, longitude: Number.NaN })).toBeNull();
  });

  it("drops a pin with missing coordinates but keeps the card", () => {
    expect(restaurantToMapPin({ ...real, latitude: undefined, longitude: undefined })).toBeNull();
    expect(restaurantToMapPin({ ...real, latitude: null, longitude: null })).toBeNull();
  });

  it("omits an unparseable mapsUrl rather than failing the pin", () => {
    const pin = restaurantToMapPin({ ...real, mapsUrl: "not-a-url" });
    expect(pin).not.toBeNull();
    expect(pin?.placeUri).toBeUndefined();
  });
});
