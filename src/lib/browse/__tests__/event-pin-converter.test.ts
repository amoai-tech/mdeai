import { describe, expect, it } from "vitest";
import { eventToMapPin } from "@/lib/browse/browse-pin-converters";

const base = {
  id: "evt-1",
  slug: "reina-de-antioquia",
  title: "Reina de Antioquia 2026 Finals",
  venue: "Hotel Intercontinental, El Poblado",
  neighborhood: "El Poblado",
  startsAt: "2027-02-24T01:00:00+00:00",
  latitude: 6.2136466,
  longitude: -75.5582035,
  mapsUrl: "https://maps.google.com/?cid=1",
};

describe("eventToMapPin", () => {
  it("builds a canonical event pin from saved coordinates with a real Details path and local date", () => {
    expect(eventToMapPin(base)).toEqual({
      id: "event-evt-1",
      category: "event",
      lat: 6.2136466,
      lng: -75.5582035,
      title: "Reina de Antioquia 2026 Finals",
      subtitle: "Hotel Intercontinental, El Poblado",
      placeUri: "https://maps.google.com/?cid=1",
      source: "sql",
      meta: { summary: "Tue, Feb 23, 8:00 PM", detailsPath: "/events/reina-de-antioquia" },
    });
  });

  it.each([
    ["missing latitude", { latitude: undefined }],
    ["missing longitude", { longitude: null }],
    ["latitude out of range", { latitude: 99 }],
    ["non-finite longitude", { longitude: Number.POSITIVE_INFINITY }],
  ])("returns no pin for %s, never a guessed position", (_label, patch) => {
    expect(eventToMapPin({ ...base, ...patch })).toBeNull();
  });

  it("drops an unsafe Maps URL but keeps the pin", () => {
    const pin = eventToMapPin({ ...base, mapsUrl: "javascript:alert(1)" });
    expect(pin?.placeUri).toBeUndefined();
    expect(pin?.id).toBe("event-evt-1");
  });
});
