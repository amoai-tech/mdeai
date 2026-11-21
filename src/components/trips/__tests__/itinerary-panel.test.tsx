// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TripItemRow } from "@/lib/trips/trip-item-types";
import { ItineraryPanel } from "../itinerary-panel";

const item = (overrides: Partial<TripItemRow>): TripItemRow => ({
  id: "item",
  item_type: "restaurant",
  source_id: "11111111-1111-4111-8111-111111111111",
  title: "Restaurant",
  created_at: "2026-11-01T00:00:00.000Z",
    position: 0,
  description: null,
  start_at: "2026-11-22T12:00:00.000Z",
  end_at: null,
  location_name: null,
  latitude: null,
  longitude: null,
  ...overrides,
});

function renderItems(items: TripItemRow[]) {
  return render(
    <ItineraryPanel
      items={items}
      nowIso="2026-11-10T12:00:00.000Z"
      onShowOnMap={() => {}}
    />,
  );
}

describe("ItineraryPanel location state", () => {
  it("keeps View on map and no unavailable label for valid coordinates", () => {
    renderItems([item({ id: "valid", latitude: 6.25, longitude: -75.59 })]);
    expect(screen.getByTestId("itinerary-show-on-map-valid")).not.toBeNull();
    expect(screen.getByTestId("itinerary-item-valid").textContent).not.toContain(
      "unavailable",
    );
  });

  it("renders with a safe fallback when the stored timezone is invalid", () => {
    render(
      <ItineraryPanel
        items={[item({ id: "tz", latitude: 6.25, longitude: -75.59 })]}
        timeZone="Bogota"
      />,
    );
    expect(screen.getByTestId("itinerary-panel")).not.toBeNull();
  });

  it("clears Up Next when a valid server time becomes invalid", async () => {
    const future = item({
      id: "future-toggle",
      start_at: "2099-11-21T04:30:00.000Z",
      latitude: 6.25,
      longitude: -75.59,
    });
    const { rerender } = render(
      <ItineraryPanel
        items={[future]}
        nowIso="2026-11-10T12:00:00.000Z"
        onShowOnMap={() => {}}
      />,
    );
    expect(screen.getByTestId("itinerary-up-next")).not.toBeNull();
    rerender(<ItineraryPanel items={[future]} onShowOnMap={() => {}} />);
    await waitFor(() =>
      expect(screen.queryByTestId("itinerary-up-next")).toBeNull(),
    );
  });

  it("does not invent a 1970 Up Next when the server time is missing", () => {
    render(
      <ItineraryPanel
        items={[
          item({
            id: "future-no-now",
            start_at: "2099-11-21T04:30:00.000Z",
            latitude: 6.25,
            longitude: -75.59,
          }),
        ]}
        onShowOnMap={() => {}}
      />,
    );
    expect(screen.queryByTestId("itinerary-up-next")).toBeNull();
  });

  it("shows Up Next for the first future persisted stop", () => {
    renderItems([
      item({
        id: "future",
        title: "Late dinner",
        start_at: "2099-11-21T04:30:00.000Z",
        latitude: 6.25,
        longitude: -75.59,
      }),
    ]);
    expect(screen.getByTestId("itinerary-up-next").textContent).toContain(
      "Late dinner",
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

  it("hides View on map and labels NaN coordinates", () => {
    renderItems([item({ id: "nan", latitude: Number.NaN, longitude: -75.59 })]);
    expect(screen.queryByTestId("itinerary-show-on-map-nan")).toBeNull();
    expect(screen.getByTestId("itinerary-item-nan").textContent).toContain(
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
