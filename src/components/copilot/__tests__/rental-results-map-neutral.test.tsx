// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  panToPin: vi.fn(),
  openVenueDetail: vi.fn(),
  openScheduleViewing: vi.fn(),
  selectedPinId: null as string | null,
}));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ selectedPinId: ui.selectedPinId, panToPin: ui.panToPin }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({
    openVenueDetail: ui.openVenueDetail,
    openScheduleViewing: ui.openScheduleViewing,
  }),
}));
vi.mock("@/components/chat/rich-card-results-context", () => ({
  RichCardResultsRegistrar: () => null,
}));
vi.mock("@/components/copilot/tool-pins-sync", () => ({ ToolPinsSync: () => null }));

import { RentalResults } from "@/components/copilot/search-tool-result-cards";

const rental = (id: string, coords?: { latitude: number; longitude: number }) => ({
  id,
  title: `Rental ${id}`,
  neighborhood: "Laureles",
  nightly_price: 100,
  price_monthly: 3000000,
  currency: "COP",
  bedrooms: 2,
  can_schedule_viewing: false,
  ...coords,
});

let root: Root;
let container: HTMLElement;
function render() {
  act(() => root.render(
    <RentalResults result={{
      source: "supabase",
      results: [rental("mapped", { latitude: 6.24, longitude: -75.59 }), rental("unmapped")],
    }} />,
  ));
}
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  ui.panToPin.mockReset();
  ui.openVenueDetail.mockReset();
  ui.openScheduleViewing.mockReset();
  ui.selectedPinId = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SAN-472 chat rental card/map parity", () => {
  it("mapped result shares canonical listing pin and focuses the map", () => {
    render();
    const card = container.querySelector('[data-pin-id="rental-mapped"]');
    expect(card).not.toBeNull();
    act(() => (card!.querySelector('[role="button"]') as HTMLElement).click());
    expect(ui.panToPin).toHaveBeenCalledWith("rental-mapped");
  });
  it("unmapped result opens detail without selecting or inventing a pin", () => {
    render();
    const card = Array.from(container.querySelectorAll('[data-testid="rental-card"]'))
      .find((el) => el.textContent?.includes("Rental unmapped"));
    expect(card).toBeDefined();
    expect(card!.hasAttribute("data-pin-id")).toBe(false);
    act(() => (card!.querySelector('[role="button"]') as HTMLElement).click());
    expect(ui.openVenueDetail).toHaveBeenCalledTimes(1);
    expect(ui.panToPin).not.toHaveBeenCalled();
  });
  it("does not show an unmapped item as a selected map pin", () => {
    ui.selectedPinId = "rental-unmapped";
    render();
    const card = Array.from(container.querySelectorAll('[data-testid="rental-card"]'))
      .find((el) => el.textContent?.includes("Rental unmapped"));
    expect(card?.getAttribute("data-selected")).toBe("false");
  });
});
