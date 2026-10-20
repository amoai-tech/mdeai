// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ venueDetail: null as unknown }));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({
    venueDetail: ui.venueDetail,
    closeVenueDetail: vi.fn(),
    openScheduleViewing: vi.fn(),
    setEventVenueStep: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-public-event-detail", () => ({
  usePublicEventDetail: () => ({ event: null, state: "idle", error: null }),
}));

import { VenueDetailSheet } from "@/components/sheets/venue-detail-sheet";

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const base = { kind: "rental", listingId: "r1", pinId: "rental-r1", title: "Apt", neighborhood: "Laureles" };

describe("SAN-1504 old pop-up sheet", () => {
  it("still handles a rental that only has the reduced fields", () => {
    ui.venueDetail = base;
    act(() => root.render(<VenueDetailSheet />));
    expect(document.body.querySelector('[data-testid="venue-detail-sheet"]')).not.toBeNull();
  });

  it("stays closed for a rental that has the full payload, so two detail views never open together", () => {
    ui.venueDetail = { ...base, rental: { id: "r1" } };
    act(() => root.render(<VenueDetailSheet />));
    expect(document.body.querySelector('[data-testid="venue-detail-sheet"]')).toBeNull();
  });
});
