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
function render(result: unknown = {
  source: "supabase",
  results: [rental("mapped", { latitude: 6.24, longitude: -75.59 }), rental("unmapped")],
}) {
  act(() => {
    root.render(<RentalResults result={result} />);
  });
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

describe("rental budget mismatch explanation", () => {
  const note = "External advertisements priced in COP/month are excluded from USD/night budget searches.";

  it("shows the mismatch once and omits ranking for an empty result", () => {
    render({ source: "supabase", results: [], budgetNote: note,
      rankExplanation: [{ factor: "neighborhood", score: 1, note: "Laureles filter" }] });
    expect(container.textContent?.split(note).length - 1).toBe(1);
    expect(container.textContent).not.toContain("Why these rentals");
  });

  it("keeps the comparison note visible when other listings matched", () => {
    render({ source: "supabase", results: [rental("one")], budgetNote: note });
    expect(container.textContent?.split(note).length - 1).toBe(1);
  });
});

describe("unapplied rental requests disclosure", () => {
  const note = "I can't filter by pet-friendly yet, so check each card.";

  it("shows the same sentence once when cards are rendered", () => {
    render({ source: "supabase", results: [rental("one")], unappliedRequests: ["pet-friendly"] });
    expect(container.textContent?.split(note).length - 1).toBe(1);
  });

  it("admits the request in an empty result instead of implying it applied", () => {
    render({ source: "supabase", results: [], unappliedRequests: ["pet-friendly"] });
    expect(container.textContent).toContain("I can't filter by pet-friendly yet.");
    expect(container.textContent).not.toContain("so check each card");
  });

  it("adds nothing when the search applied every request", () => {
    render({ source: "supabase", results: [rental("one")], unappliedRequests: [] });
    expect(container.textContent).not.toMatch(/can't filter/);
  });
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
