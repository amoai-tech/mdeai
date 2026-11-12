// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TripItemRow, TripWorkspaceData } from "@/lib/trips/trip-item-types";
import { TripWorkspaceView } from "../trip-workspace-view";

vi.mock("@/app/trips/actions", () => ({
  updateTripTimezone: vi.fn(async () => ({ ok: true, timezone: "America/Bogota" })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/trips/trip-map-panel", () => ({
  TripMapPanel: ({
    items,
    selectedItemId,
    onSelectItem,
  }: {
    items: TripItemRow[];
    selectedItemId: string | null;
    onSelectItem: (id: string) => void;
  }) => (
    <div data-testid="trip-map-panel-mock" data-selected={selectedItemId ?? ""}>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelectItem(item.id)}>
          pin-{item.id}
        </button>
      ))}
    </div>
  ),
}));

const items: TripItemRow[] = [
  {
    id: "a",
    item_type: "rental",
    source_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-11-01T00:00:00.000Z",
    position: 0,
    title: "Apartment A",
    description: null,
    start_at: "2026-11-14T15:00:00.000Z",
    end_at: null,
    location_name: "Laureles",
    latitude: 6.25,
    longitude: -75.59,
  },
  {
    id: "b",
    item_type: "restaurant",
    source_id: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-11-01T00:00:00.000Z",
    position: 0,
    title: "Café B",
    description: null,
    start_at: "2026-11-14T18:00:00.000Z",
    end_at: null,
    location_name: "Poblado",
    latitude: 6.21,
    longitude: -75.57,
  },
];

const trip: TripWorkspaceData = {
  id: "trip-1",
  title: "Saturday",
  description: null,
  destination: "Medellín",
  start_date: "2026-11-14",
  end_date: "2026-11-14",
  status: "planning",
  budget: null,
  currency: "COP",
  timezone: "America/Bogota",
  items,
  conflicts: [],
};

describe("TripWorkspaceView selection", () => {
  it("opens the map with the selected item from the itinerary", () => {
    render(<TripWorkspaceView trip={trip} />);
    fireEvent.click(screen.getByTestId("itinerary-show-on-map-a"));
    expect(screen.getByTestId("trip-tab-map").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("trip-map-panel-mock").getAttribute("data-selected")).toBe("a");
  });

  it("renders equal-start stops in explicit position order", () => {
    const tied: TripItemRow[] = [
      {
        ...items[0],
        id: "pos-2",
        title: "Second slot",
        start_at: "2026-11-14T20:00:00.000Z",
        position: 2,
        created_at: "2026-11-01T00:00:01.000Z",
      },
      {
        ...items[0],
        id: "pos-1",
        title: "First slot",
        start_at: "2026-11-14T20:00:00.000Z",
        position: 1,
        created_at: "2026-11-01T00:00:02.000Z",
      },
    ];
    render(<TripWorkspaceView trip={{ ...trip, items: tied }} />);
    const text = screen.getByTestId("itinerary-panel").textContent ?? "";
    expect(text.indexOf("First slot")).toBeLessThan(text.indexOf("Second slot"));
  });

  it("keeps the selected stop when moving between map and itinerary", () => {
    render(<TripWorkspaceView trip={trip} />);
    fireEvent.click(screen.getByTestId("trip-tab-map"));
    fireEvent.click(screen.getByText("pin-b"));
    fireEvent.click(screen.getByTestId("trip-tab-itinerary"));
    expect(screen.getByTestId("itinerary-item-b").getAttribute("aria-current")).toBe("true");
  });
});
