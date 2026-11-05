// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapContextProvider, useMapContext } from "@/platform/maps/map-context";
import { ToolPinsSync } from "@/components/copilot/tool-pins-sync";
import type { MapPin, MapPinCategory } from "@/platform/contracts";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

let root: Root;
let node: HTMLDivElement;
let map!: ReturnType<typeof useMapContext>;

function Probe() {
  const context = useMapContext();
  useEffect(() => {
    map = context;
  }, [context]);
  return null;
}

function pin(id: string, category: MapPinCategory, lat = 6.24): MapPin {
  return { id, category, lat, lng: -75.58, title: id, source: "sql" };
}

function change(category: MapPinCategory, incoming: MapPin[]) {
  act(() => map.mergePinsByCategory(category, incoming));
}
function focus(id: string) {
  act(() => map.panToPin(id));
}

beforeEach(() => {
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
  act(() => root.render(
    <MapContextProvider seedMockPin={false}><Probe /></MapContextProvider>,
  ));
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});

describe("SAN-1645 canonical pin selection lifecycle", () => {
  it("clears selection and requested focus atomically when a new search removes the selected pin", () => {
    change("rental", [pin("rental-A", "rental")]);
    focus("rental-A");
    expect(map.selectedPinId).toBe("rental-A");
    expect(map.focusPinId).toBe("rental-A");
    change("rental", [pin("rental-B", "rental")]);
    expect(map.pins.map(p => p.id)).toEqual(["rental-B"]);
    expect(map.selectedPinId).toBeNull();
    expect(map.focusPinId).toBeNull();
  });

  it("does not clear valid selection in another category when replacing rentals", () => {
    change("rental", [pin("rental-A", "rental")]);
    change("restaurant", [pin("restaurant-X", "restaurant")]);
    focus("restaurant-X");
    change("rental", [pin("rental-B", "rental")]);
    expect(map.selectedPinId).toBe("restaurant-X");
    expect(map.focusPinId).toBe("restaurant-X");
  });

  it("retains selection when the same marker gains corrected coordinates", () => {
    change("rental", [pin("rental-A", "rental")]);
    focus("rental-A");
    change("rental", [pin("rental-A", "rental", 6.25)]);
    expect(map.selectedPinId).toBe("rental-A");
    expect(map.focusPinId).toBe("rental-A");
    expect(map.pins.find(p => p.id === "rental-A")?.lat).toBe(6.25);
  });

  it("clears focus as well as selection on clearPins and cannot resurrect a removed selection", () => {
    change("rental", [pin("rental-A", "rental")]);
    focus("rental-A");
    act(() => map.clearPins());
    expect(map.selectedPinId).toBeNull();
    expect(map.focusPinId).toBeNull();
    change("rental", [pin("rental-A", "rental")]);
    expect(map.selectedPinId).toBeNull();
  });

  it("an old Nearby result cannot erase new rental pins when the anchor disappears", () => {
    change("rental", [pin("rental-A", "rental")]);
    const nearby = {
      source: "grounding",
      metadata: { searchMode: "nearby", anchorPinId: "rental-A" },
      results: [{
        id: "cafe-X",
        title: "Cafe X",
        latitude: 6.245,
        longitude: -75.58,
        placeId: "cafe-X",
        mapsUrl: "https://maps.google.com/?cid=1",
      }],
    };
    act(() => root.render(
      <MapContextProvider seedMockPin={false}>
        <Probe />
        <ToolPinsSync category="grounded" result={nearby} />
      </MapContextProvider>,
    ));
    expect(map.pins.some(p => p.id === "rental-A")).toBe(true);
    expect(map.pins.some(p => p.id === "grounded-cafe-X")).toBe(true);

    change("rental", [pin("rental-B", "rental")]);
    expect(map.pins.some(p => p.id === "rental-B")).toBe(true);
    expect(map.pins.some(p => p.id === "rental-A")).toBe(false);
    expect(map.pins.some(p => p.id === "grounded-cafe-X")).toBe(true);
  });

  it("clears a pending focus when deselecting a marker", () => {
    change("rental", [pin("rental-A", "rental")]);
    focus("rental-A");
    act(() => map.setSelectedPinId(null));
    expect(map.selectedPinId).toBeNull();
    expect(map.focusPinId).toBeNull();
  });

  it("never focuses a nonexistent pin and clears selection for an emptied category", () => {
    focus("rental-missing");
    expect(map.selectedPinId).toBeNull();
    expect(map.focusPinId).toBeNull();
    change("rental", [pin("rental-A", "rental")]);
    focus("rental-A");
    change("rental", []);
    expect(map.selectedPinId).toBeNull();
    expect(map.focusPinId).toBeNull();
  });
});
