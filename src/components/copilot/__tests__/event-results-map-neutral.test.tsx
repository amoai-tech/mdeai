// @vitest-environment jsdom
/**
 * SAN-1422 · Make map results truthful and clear stale pins when results have no coordinates.
 * An event without trusted coordinates is still a usable card, but it must not pan or select a map
 * target that does not exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const ui = vi.hoisted(() => ({
  panToPin: vi.fn(),
  openVenueDetail: vi.fn(),
  selectedPinId: null as string | null,
}));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ selectedPinId: ui.selectedPinId, panToPin: ui.panToPin }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({ openVenueDetail: ui.openVenueDetail }),
}));
vi.mock("@/components/chat/event-search-results-context", () => ({
  useEventSearchResults: () => ({ setRows: vi.fn(), setWebCitations: vi.fn() }),
}));
vi.mock("@/components/chat/rich-card-results-context", () => ({
  RichCardResultsRegistrar: () => null,
}));
vi.mock("@/components/copilot/tool-pins-sync", () => ({ ToolPinsSync: () => null }));

import { EventResults } from "@/components/copilot/search-tool-result-cards";

const event = (id: string, coords?: { latitude: number; longitude: number }) => ({
  id,
  title: `Event ${id}`,
  venue: "Club",
  neighborhood: "Poblado",
  startsAt: "2026-10-10T01:00:00.000Z",
  pricePerTicket: 15,
  currency: "USD",
  ...coords,
});

let root: Root;
let container: HTMLElement;

function render() {
  act(() =>
    root.render(
      <EventResults
        result={{
          results: [event("mapped", { latitude: 6.2, longitude: -75.5 }), event("unmapped")],
          source: "supabase",
        }}
      />,
    ),
  );
}

function cardBody(pinId: string): HTMLElement {
  const card = container.querySelector(`[data-pin-id="${pinId}"]`);
  const body = card?.querySelector('[role="button"]');
  if (!(body instanceof HTMLElement)) throw new Error(`no clickable card for ${pinId}`);
  return body;
}

beforeEach(() => {
  // jsdom has no layout engine; the list scrolls the selected card into view.
  Element.prototype.scrollIntoView = vi.fn();
  ui.panToPin.mockReset();
  ui.openVenueDetail.mockReset();
  ui.selectedPinId = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("event cards on the map", () => {
  it("an event with coordinates pans to its pin and opens its details", () => {
    render();
    act(() => cardBody("event-mapped").click());
    expect(ui.panToPin).toHaveBeenCalledWith("event-mapped");
    expect(ui.openVenueDetail).toHaveBeenCalledTimes(1);
  });

  it("an event without coordinates still opens its details but never touches the map", () => {
    render();
    act(() => cardBody("event-unmapped").click());
    expect(ui.openVenueDetail).toHaveBeenCalledTimes(1);
    expect(ui.panToPin).not.toHaveBeenCalled();
  });

  it("an event without coordinates is never shown as the selected pin", () => {
    ui.selectedPinId = "event-unmapped";
    render();
    expect(container.querySelector('[data-pin-id="event-unmapped"]')?.getAttribute("data-selected")).toBe("false");
  });

  it("an event with coordinates is shown as selected", () => {
    ui.selectedPinId = "event-mapped";
    render();
    expect(container.querySelector('[data-pin-id="event-mapped"]')?.getAttribute("data-selected")).toBe("true");
  });
});
