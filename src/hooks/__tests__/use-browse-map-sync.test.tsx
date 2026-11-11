// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { MapPin, MapPinCategory } from "@/platform/contracts";

const state = vi.hoisted(() => ({
  selectedPinId: null as string | null,
  merge: vi.fn(),
  fit: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({
    selectedPinId: state.selectedPinId,
    mergePinsByCategory: state.merge,
    requestFitBounds: state.fit,
    setSelectedPinId: state.select,
  }),
}));

import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";

const pin = (id: string, lat = 6.24, title = id): MapPin => ({
  id: `rental-${id}`,
  category: "rental",
  lat,
  lng: -75.59,
  title,
  source: "sql",
});

function Probe({ pins, category = "rental" }: { pins: MapPin[]; category?: MapPinCategory }) {
  useBrowseMapSync(pins, category);
  return null;
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.selectedPinId = null;
  state.merge.mockReset();
  state.fit.mockReset();
  state.select.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SAN-472 browse map sync", () => {
  it("clears a stale selected rental after filters remove it", () => {
    act(() => root.render(<Probe pins={[pin("old")]} />));
    state.selectedPinId = "rental-old";
    act(() => root.render(<Probe pins={[pin("new")]} />));
    expect(state.merge).toHaveBeenLastCalledWith("rental", [pin("new")]);
    expect(state.select).toHaveBeenCalledWith(null);
  });

  it("replaces old rental pins with an empty result set", () => {
    act(() => root.render(<Probe pins={[pin("old")]} />));
    act(() => root.render(<Probe pins={[]} />));
    expect(state.merge).toHaveBeenLastCalledWith("rental", []);
  });

  it("clears a stale selected café/nightlife venue after a filter removes it", () => {
    // SAN-1122: the same sync owns the "venue" category (cafés + nightlife pins).
    const venuePin = (id: string): MapPin => ({
      id: `venue-${id}`,
      category: "venue",
      lat: 6.24,
      lng: -75.59,
      title: id,
      source: "sql",
    });
    act(() => root.render(<Probe category="venue" pins={[venuePin("kept"), venuePin("dropped")]} />));
    state.selectedPinId = "venue-dropped";
    act(() => root.render(<Probe category="venue" pins={[venuePin("kept")]} />));
    expect(state.merge).toHaveBeenLastCalledWith("venue", [venuePin("kept")]);
    expect(state.select).toHaveBeenCalledWith(null);
  });

  it("keeps a matching selection when only its coordinate/title changes", () => {
    state.selectedPinId = "rental-old";
    act(() => root.render(<Probe pins={[pin("old")]} />));
    act(() => root.render(<Probe pins={[pin("old", 6.25, "Corrected title")]} />));
    expect(state.merge).toHaveBeenLastCalledWith("rental", [pin("old", 6.25, "Corrected title")]);
    expect(state.select).not.toHaveBeenCalled();
  });
});
