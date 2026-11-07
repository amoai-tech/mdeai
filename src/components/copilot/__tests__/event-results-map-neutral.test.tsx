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
  setRows: vi.fn(),
  selectedPinId: null as string | null,
  searchEvents: vi.fn(() => Promise.resolve(true)),
  liveAgent: true,
}));

vi.mock("@/hooks/use-event-search-fast-path", () => ({
  useEventSearchFastPath: () => ({ handleUserMessage: ui.searchEvents }),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({
    agent: ui.liveAgent ? { isRunning: false } : undefined,
    isReady: true,
  }),
}));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ selectedPinId: ui.selectedPinId, panToPin: ui.panToPin }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({ openVenueDetail: ui.openVenueDetail }),
}));
vi.mock("@/components/chat/event-search-results-context", () => ({
  useEventSearchResults: () => ({ setRows: ui.setRows, setWebCitations: vi.fn() }),
}));
vi.mock("@/components/chat/rich-card-results-context", () => ({
  RichCardResultsRegistrar: () => null,
}));
vi.mock("@/components/copilot/tool-pins-sync", () => ({ ToolPinsSync: () => null }));
vi.mock("@/components/copilot/search-tool-result-ownership", () => ({
  useCurrentSearchToolResult: () => true,
}));

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

// React 19 act() uses this flag to detect a properly configured jsdom test environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  ui.searchEvents.mockReset();
  ui.searchEvents.mockResolvedValue(true);
  ui.setRows.mockReset();
  ui.selectedPinId = null;
  ui.liveAgent = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SAN-1407 empty event result replacement", () => {
  it("clears previously shown rows when the latest finished event result is empty", () => {
    act(() => root.render(<EventResults result={{ results: [event("old")], source: "supabase" }} />));
    expect(ui.setRows).toHaveBeenLastCalledWith([expect.objectContaining({ id: "old" })]);
    act(() => root.render(<EventResults result={{ results: [], source: "supabase" }} />));
    expect(ui.setRows).toHaveBeenLastCalledWith([]);
  });
});

describe("event cards on the map", () => {
  it("preserves tier-backed price, Buy availability and URL in the shared rows", () => {
    act(() =>
      root.render(
        <EventResults result={{
          results: [{
            ...event("paid"),
            pricePerTicket: 40000,
            currency: "COP",
            canBuyTickets: true,
            ticketUrl: "/events/paid",
          }],
          source: "supabase",
        }} />,
      ),
    );
    expect(ui.setRows).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "paid",
        pricePerTicket: 40000,
        currency: "COP",
        canBuyTickets: true,
        ticketUrl: "/events/paid",
      }),
    ]);
  });

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

  it("opens exactly one recovery modal for a current authorized event", async () => {
    render();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    act(() => {
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery", { detail: { eventId: "mapped" } }));
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery", { detail: { eventId: "mapped" } }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    expect(document.body.querySelectorAll('[data-testid="event-card-modal"]')).toHaveLength(1);
    expect(ui.searchEvents).not.toHaveBeenCalled();
  });

  it("does not recover over an existing A2UI card or without an event ID", async () => {
    const a2ui = document.createElement("div");
    a2ui.dataset.testid = "a2ui-event-card";
    document.body.appendChild(a2ui);
    render();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    act(() => {
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery", { detail: { eventId: "mapped" } }));
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery", { detail: {} }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    expect(document.body.querySelectorAll('[data-testid="event-card-modal"]')).toHaveLength(0);
    a2ui.remove();
  });

  it("an event with coordinates is shown as selected", () => {
    ui.selectedPinId = "event-mapped";
    render();
    expect(container.querySelector('[data-pin-id="event-mapped"]')?.getAttribute("data-selected")).toBe("true");
  });

  it("Show as card opens the existing EventCard without a model run", () => {
    render();
    const button = container.querySelector('[data-testid="event-show-card"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    act(() => (button as HTMLButtonElement).click());
    const modal = document.body.querySelector('[data-testid="event-card-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.querySelector('[data-pin-id="event-mapped"]')).not.toBeNull();
    const details = modal?.querySelector('[data-testid="event-details-cta"]');
    expect(details).toBeInstanceOf(HTMLElement);
    act(() => (details as HTMLElement).click());
    expect(ui.openVenueDetail).toHaveBeenCalledTimes(1);
    expect(ui.panToPin).toHaveBeenCalledWith("event-mapped");
    expect(document.body.querySelector('[data-testid="event-card-modal"]')).toBeNull();
    expect(ui.searchEvents).not.toHaveBeenCalled();
  });
});


describe("EventResults empty and unavailable states", () => {
  function showResult(result: unknown) {
    act(() => root.render(<EventResults result={result} />));
  }

  it("routes suggestions into the existing event-search handler instead of an AI-only turn", async () => {
    showResult({ results: [], total: 0, source: "supabase" });
    expect(container.querySelector('[data-testid="events-search-error"]')).toBeNull();
    const weekend = container.querySelector('[data-testid="events-empty-suggest-weekend"]');
    expect(weekend).toBeInstanceOf(HTMLButtonElement);
    await act(async () => (weekend as HTMLButtonElement).click());
    expect(ui.searchEvents).toHaveBeenCalledOnce();
    expect(ui.searchEvents).toHaveBeenCalledWith("Show events this weekend in Medellín");
  });

  it("reports failed suggestions rather than silently claiming a search completed", async () => {
    ui.searchEvents.mockRejectedValueOnce(new Error("API 503"));
    showResult({ results: [], total: 0, source: "supabase" });
    const weekend = container.querySelector('[data-testid="events-empty-suggest-weekend"]');
    await act(async () => (weekend as HTMLButtonElement).click());
    expect(container.querySelector('[data-testid="events-suggestion-error"]')).not.toBeNull();
  });

  it("renders the empty state without calling provider-only hooks when no live agent is mounted", () => {
    ui.liveAgent = false;
    showResult({ results: [], total: 0, source: "supabase" });
    expect(container.querySelector('[data-testid="events-empty"]')).not.toBeNull();
    const weekend = container.querySelector('[data-testid="events-empty-suggest-weekend"]');
    expect(weekend).toBeInstanceOf(HTMLButtonElement);
    expect((weekend as HTMLButtonElement).disabled).toBe(true);
    act(() => (weekend as HTMLButtonElement).click());
    expect(ui.searchEvents).not.toHaveBeenCalled();
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
