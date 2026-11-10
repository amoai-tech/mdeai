// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TripItemRow } from "@/lib/trips/trip-item-types";
import { ItineraryPanel } from "../itinerary-panel";

const noLocation: TripItemRow = {
  id: "a",
  item_type: "restaurant",
  source_id: "11111111-1111-4111-8111-111111111111",
  title: "El Colombiano",
  description: null,
  start_at: "2026-11-22T12:00:00.000Z",
  end_at: null,
  location_name: null,
  latitude: null,
  longitude: null,
};

describe("ItineraryPanel location state", () => {
  it("labels a saved item without coordinates instead of implying a map pin", () => {
    render(<ItineraryPanel items={[noLocation]} onShowOnMap={() => {}} />);
    expect(screen.getByTestId("itinerary-item-a").textContent).toContain(
      "Location unavailable",
    );
    expect(screen.queryByTestId("itinerary-show-on-map-a")).toBeNull();
  });
});
