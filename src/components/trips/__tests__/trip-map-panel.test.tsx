// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TripItemRow } from "@/lib/trips/trip-item-types";
import { TripMapPanel, mappableTripPins } from "../trip-map-panel";

const mapsStatus = vi.hoisted(() => ({ value: "ok" as string }));
const mockMaps = vi.hoisted(() => ({ value: false }));

vi.mock("@vis.gl/react-google-maps", () => ({
  Map: ({ children }: { children: ReactNode }) => (
    <div data-testid="google-map">{children}</div>
  ),
  AdvancedMarker: ({ children, title }: { children: ReactNode; title?: string }) => (
    <div data-testid="advanced-marker" title={title}>
      {children}
    </div>
  ),
  useMap: () => null,
}));

vi.mock("@/components/maps/use-maps-auth-failure", () => ({
  useMapsStatus: () => mapsStatus.value,
}));

vi.mock("@/components/maps/map-referer-help", () => ({
  MapsUnavailable: ({ reason }: { reason: string }) => (
    <div data-testid="maps-unavailable">{reason}</div>
  ),
}));

vi.mock("@/platform/maps/map-config", () => ({
  MEDELLIN_CENTER: { lat: 6.2442, lng: -75.5812 },
  DEFAULT_MAP_ZOOM: 13,
  getGoogleMapsMapId: () => "test-map-id",
  isE2EMapsMockEnabled: () => mockMaps.value,
}));

function item(overrides: Partial<TripItemRow> & Pick<TripItemRow, "id" | "title">): TripItemRow {
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    source_id: "11111111-1111-4111-8111-111111111111",
    item_type: "rental",
    description: null,
    start_at: null,
    end_at: null,
    location_name: "Laureles",
    latitude: 6.25,
    longitude: -75.59,
    ...rest,
  };
}

describe("TripMapPanel", () => {
  it("renders only finite-coordinate items with itinerary numbering", () => {
    const items = [
      item({ id: "a", title: "Apartment A" }),
      item({ id: "b", title: "No location", latitude: null }),
      item({ id: "c", title: "Café C", latitude: 6.3, longitude: -75.6 }),
    ];
    expect(mappableTripPins(items)).toEqual([
      expect.objectContaining({ id: "a", stopNumber: 1 }),
      expect.objectContaining({ id: "c", stopNumber: 2 }),
    ]);

    render(
      <TripMapPanel items={items} selectedItemId={null} onSelectItem={() => {}} />,
    );
    expect(screen.getByTestId("trip-map-pin-a").textContent).toContain("1");
    expect(screen.getByTestId("trip-map-pin-c").textContent).toContain("2");
    expect(screen.queryByTestId("trip-map-pin-b")).toBeNull();
  });

  it("rejects coordinates outside valid geographic ranges", () => {
    const items = [
      item({ id: "valid", title: "Valid", latitude: 6.25, longitude: -75.59 }),
      item({ id: "bad-lat", title: "Bad latitude", latitude: 91, longitude: -75.59 }),
      item({ id: "bad-lng", title: "Bad longitude", latitude: 6.25, longitude: -181 }),
    ];
    expect(mappableTripPins(items)).toEqual([
      expect.objectContaining({ id: "valid", stopNumber: 1 }),
    ]);
  });

  it("calls onSelectItem when a numbered pin is clicked", () => {
    const onSelect = vi.fn();
    render(
      <TripMapPanel
        items={[item({ id: "a", title: "Apartment A" })]}
        selectedItemId={null}
        onSelectItem={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("trip-map-pin-a"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("shows the selected stop and marks the pin pressed", () => {
    render(
      <TripMapPanel
        items={[item({ id: "a", title: "Apartment A" })]}
        selectedItemId="a"
        onSelectItem={() => {}}
      />,
    );
    expect(screen.getByTestId("trip-map-selected-stop").textContent).toContain("Apartment A");
    expect(screen.getByTestId("trip-map-pin-a").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("trip-map-selected-details").getAttribute("href")).toBe(
      "/rentals/11111111-1111-4111-8111-111111111111",
    );
  });

  it("shows an honest empty state when no item has coordinates", () => {
    render(
      <TripMapPanel
        items={[item({ id: "a", title: "No location", latitude: null })]}
        selectedItemId={null}
        onSelectItem={() => {}}
      />,
    );
    expect(screen.getByTestId("trip-map-empty")).not.toBeNull();
    expect(screen.queryByTestId("google-map")).toBeNull();
  });

  it("renders usable pins in E2E mock-maps mode without an APIProvider", () => {
    mockMaps.value = true;
    render(
      <TripMapPanel
        items={[item({ id: "a", title: "Apartment A" })]}
        selectedItemId="a"
        onSelectItem={() => {}}
      />,
    );
    expect(screen.getByTestId("trip-map-mock")).not.toBeNull();
    expect(screen.getByTestId("trip-map-pin-a").getAttribute("aria-pressed")).toBe("true");
    mockMaps.value = false;
  });

  it("degrades only the map when Google Maps is unavailable", () => {
    mapsStatus.value = "auth-failed";
    render(
      <TripMapPanel
        items={[item({ id: "a", title: "Apartment A" })]}
        selectedItemId={null}
        onSelectItem={() => {}}
      />,
    );
    expect(screen.getByTestId("maps-unavailable").textContent).toContain("auth-failed");
    expect(screen.getByText(/itinerary is still available/i)).not.toBeNull();
    mapsStatus.value = "ok";
  });
});
