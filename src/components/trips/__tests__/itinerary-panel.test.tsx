// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TripItemRow } from "@/lib/trips/trip-item-types";
import { ItineraryPanel } from "../itinerary-panel";

const item = (overrides: Partial<TripItemRow>): TripItemRow => ({
  id: "item",
  item_type: "restaurant",
  source_id: "11111111-1111-4111-8111-111111111111",
  title: "Restaurant",
  description: null,
  start_at: "2026-11-22T12:00:00.000Z",
  end_at: null,
  location_name: null,
  latitude: null,
  longitude: null,
  ...overrides,
});

function renderItems(items: TripItemRow[]) {
  return render(<ItineraryPanel items={items} onShowOnMap={() => {}} />);
}

describe("ItineraryPanel location state", () => {
  it("keeps View on map and no unavailable label for valid coordinates", () => {
    renderItems([item({ id: "valid", latitude: 6.25, longitude: -75.59 })]);
    expect(screen.getByTestId("itinerary-show-on-map-valid")).not.toBeNull();
    expect(screen.getByTestId("itinerary-item-valid").textContent).not.toContain(
      "unavailable",
    );
  });

  it("hides View on map and labels a missing location", () => {
    renderItems([item({ id: "missing" })]);
    expect(screen.queryByTestId("itinerary-show-on-map-missing")).toBeNull();
    expect(screen.getByTestId("itinerary-item-missing").textContent).toContain(
      "Location unavailable",
    );
  });

  it("hides View on map for an out-of-range latitude", () => {
    renderItems([
      item({ id: "bad-lat", latitude: 91, longitude: -75.59, location_name: "Laureles" }),
    ]);
    expect(screen.queryByTestId("itinerary-show-on-map-bad-lat")).toBeNull();
    expect(screen.getByTestId("itinerary-item-bad-lat").textContent).toContain(
      "Map location unavailable",
    );
  });

  it("hides View on map for an out-of-range longitude", () => {
    renderItems([item({ id: "bad-lng", latitude: 6.25, longitude: 181 })]);
    expect(screen.queryByTestId("itinerary-show-on-map-bad-lng")).toBeNull();
    expect(screen.getByTestId("itinerary-item-bad-lng").textContent).toContain(
      "Location unavailable",
    );
  });

  it("hides View on map when only one coordinate is present", () => {
    renderItems([item({ id: "partial", latitude: 6.25, longitude: null })]);
    expect(screen.queryByTestId("itinerary-show-on-map-partial")).toBeNull();
    expect(screen.getByTestId("itinerary-item-partial").textContent).toContain(
      "Location unavailable",
    );
  });
});
