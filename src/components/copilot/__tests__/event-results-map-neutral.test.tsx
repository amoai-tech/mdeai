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
  addMessage: vi.fn(),
  runAgent: vi.fn(async () => {}),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({
    agent: { addMessage: ui.addMessage, isRunning: false },
    isReady: true,
  }),
  useCopilotKit: () => ({ copilotkit: { runAgent: ui.runAgent } }),
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
  ui.addMessage.mockReset();
  ui.runAgent.mockReset();
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


describe("EventResults empty and unavailable states", () => {
  function showResult(result: unknown) {
    act(() => root.render(<EventResults result={result} />));
  }

  it("shows a genuine empty state with follow-up suggestions that run the existing Concierge", async () => {
    showResult({ results: [], total: 0, source: "supabase" });
    expect(container.querySelector('[data-testid="events-search-error"]')).toBeNull();
    const weekend = container.querySelector('[data-testid="events-empty-suggest-weekend"]');
    expect(weekend).toBeInstanceOf(HTMLButtonElement);
    await act(async () => (weekend as HTMLButtonElement).click());
    expect(ui.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: "user",
      content: "Show events this weekend in Medellín",
    }));
    expect(ui.runAgent).toHaveBeenCalledOnce();
  });

  it("does not disguise an unavailable database as a healthy empty market", () => {
    showResult({ results: [], total: 0, source: "fallback" });
    expect(container.querySelector('[data-testid="events-search-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="events-empty"]')).toBeNull();
  });

  it("does not disguise malformed tool output as a healthy empty market", () => {
    showResult({ total: 0, source: "supabase" });
    expect(container.querySelector('[data-testid="events-search-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="events-empty"]')).toBeNull();
  });
});
