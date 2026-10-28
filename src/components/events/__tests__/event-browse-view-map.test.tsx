// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";
import type { DiscoveryAgentResult } from "@/components/chat/discovery-tool-results";

// The workspace pulls in auth, nav and Ask MDE; the map context, pin sync and selection logic stay real.
vi.mock("@/components/browse/DiscoveryWorkspace", () => ({
  DiscoveryWorkspace: (p: { rightPanel?: unknown; askComposer?: unknown; children: unknown }) => (
    <div>
      {p.askComposer as never}
      {p.rightPanel as never}
      {p.children as never}
    </div>
  ),
}));
vi.mock("@/components/browse/BrowseMapSheet", () => ({ BrowseMapSheet: () => <i /> }));

// Stand-in for the map column: markers and the info-card Close drive the real shared map context.
vi.mock("@/components/browse/BrowseMapPanel", async () => {
  const { useMapContext } = await import("@/platform/maps/map-context");
  return {
    BrowseMapPanel: () => {
      const { pins, selectedPinId, panToPin, setSelectedPinId } = useMapContext();
      return (
        <div data-testid="map" data-selected-pin={selectedPinId ?? ""}>
          {pins.map((pin) => (
            <button key={pin.id} type="button" data-testid={`marker-${pin.id}`} onClick={() => panToPin(pin.id)}>{pin.title}</button>
          ))}
          <button type="button" data-testid="info-close" onClick={() => setSelectedPinId(null)}>close</button>
        </div>
      );
    },
  };
});

let composer: { onAgentResults: (r: DiscoveryAgentResult) => void } | null = null;
vi.mock("@/components/chat/discovery-ask-composer", () => ({
  DiscoveryAskComposer: (p: { onAgentResults: (r: DiscoveryAgentResult) => void }) => {
    composer = p;
    return null;
  },
}));
vi.mock("@/components/chat/discovery-page-context", () => ({
  DiscoveryPageContext: (p: { selectedId: string | null }) => <i data-testid="ask-context" data-selected={p.selectedId ?? ""} />,
}));

import { EventBrowseView } from "@/components/events/event-browse-view";

const make = (id: string, extra: Partial<PublishedEventListItem> = {}): PublishedEventListItem => ({
  id, eventId: id, slug: id, title: `Event ${id.toUpperCase()}`, venue: "Calle 10", neighborhood: "El Poblado",
  startsAt: "2027-02-24T01:00:00+00:00", pricePerTicket: null, canBuyTickets: false, currency: "COP",
  ticketUrl: `/events/${id}`, category: "culture", status: "published", latitude: 6.21, longitude: -75.56, ...extra,
});
const A = make("a");
const B = make("b", { latitude: 6.22, longitude: -75.57 });
const NOLOC = make("c", { latitude: undefined, longitude: undefined });
const props = { total: 2, error: null, category: null, neighborhood: null, dateWindow: null, price: null } as const;

const card = (id: string) => screen.getByLabelText(new RegExp(`^Event: Event ${id.toUpperCase()}`));
const askFor = (id: string) => within(card(id)).getByTestId("event-ask-select");
const pressed = (id: string) => askFor(id).getAttribute("aria-pressed");
const ctx = () => screen.getByTestId("ask-context").getAttribute("data-selected");
const mapPin = () => screen.getByTestId("map").getAttribute("data-selected-pin");
const search = (ids: string[]) => act(() => composer!.onAgentResults({ page: "events", ids }));
const cardTitles = () => screen.getAllByTestId("event-card").map((c) => c.getAttribute("aria-label"));

const ok = (rows: PublishedEventListItem[]) => ({ ok: true, json: async () => ({ results: rows }) }) as Response;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // jsdom has no layout; the shared map-to-card scroll hook calls this.
  Element.prototype.scrollIntoView = vi.fn();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  composer = null;
});

describe("EventBrowseView — one selected event", () => {
  it("A → B → Clear moves the card highlight, the marker and the Ask context together", async () => {
    const user = userEvent.setup();
    render(<EventBrowseView {...props} results={[A, B]} />);
    await user.click(askFor("a"));
    expect(ctx()).toBe("a");
    expect(mapPin()).toBe("event-a");
    expect(pressed("a")).toBe("true");
    await user.click(askFor("b"));
    expect(ctx()).toBe("b");
    expect(mapPin()).toBe("event-b");
    expect(pressed("a")).toBe("false");
    await user.click(askFor("b")); // "Clear selection"
    expect(ctx()).toBe("");
    expect(mapPin()).toBe("");
  });

  it("behaves the same under React StrictMode (double render): A → marker B → close clears everything", async () => {
    const user = userEvent.setup();
    render(<StrictMode><EventBrowseView {...props} results={[A, B]} /></StrictMode>);
    await user.click(askFor("a"));
    expect(ctx()).toBe("a");
    await user.click(await screen.findByTestId("marker-event-b"));
    expect(ctx()).toBe("b");
    expect(pressed("a")).toBe("false");
    await user.click(screen.getByTestId("info-close"));
    expect(ctx()).toBe("");
    expect(pressed("b")).toBe("false");
  });

  it("clicking marker B selects card B and points Ask MDE at B; closing the info card clears both", async () => {
    const user = userEvent.setup();
    render(<EventBrowseView {...props} results={[A, B]} />);
    await user.click(askFor("a"));
    await user.click(await screen.findByTestId("marker-event-b"));
    expect(pressed("b")).toBe("true");
    expect(pressed("a")).toBe("false");
    expect(ctx()).toBe("b");
    await user.click(screen.getByTestId("info-close"));
    expect(ctx()).toBe("");
    expect(pressed("b")).toBe("false");
  });

  it("an event with no saved position is still selectable for Ask MDE, has no marker, and clears the map selection", async () => {
    const user = userEvent.setup();
    render(<EventBrowseView {...props} results={[A, NOLOC]} />);
    expect(screen.queryByTestId("marker-event-c")).toBeNull();
    await user.click(askFor("a"));
    await user.click(askFor("c"));
    expect(ctx()).toBe("c");
    expect(mapPin()).toBe("");
  });

  it("drops a selection whose event is filtered out and does not bring it back when the filter is cleared", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EventBrowseView {...props} results={[A, B]} />);
    await user.click(askFor("a"));
    expect(ctx()).toBe("a");
    rerender(<EventBrowseView {...props} category="music" results={[B]} />);
    await waitFor(() => expect(ctx()).toBe(""));
    expect(mapPin()).toBe("");
    rerender(<EventBrowseView {...props} results={[A, B]} />);
    expect(ctx()).toBe("");
    expect(pressed("a")).toBe("false");
  });

  it("shows the map only when an event has a saved position, and never on a load error", () => {
    const { rerender } = render(<EventBrowseView {...props} results={[A, NOLOC]} />);
    expect(screen.getByTestId("map")).toBeTruthy();
    expect(screen.getAllByTestId("event-card")).toHaveLength(2);
    rerender(<EventBrowseView {...props} results={[NOLOC]} />);
    expect(screen.queryByTestId("map")).toBeNull();
    rerender(<EventBrowseView {...props} results={[A]} error="Could not load events." />);
    expect(screen.queryByTestId("map")).toBeNull();
  });
});

describe("EventBrowseView — Ask MDE results", () => {
  it("a failed search falls back to the canonical results with a Retry, and Retry confirms the answer", async () => {
    const user = userEvent.setup();
    render(<EventBrowseView {...props} results={[A, B]} />);
    fetchMock.mockResolvedValueOnce(ok([A]));
    search(["a"]);
    await screen.findByTestId("guest-event-results-count");
    expect(cardTitles()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);
    search(["b"]);
    const alert = await screen.findByTestId("events-lookup-error");
    expect(alert.textContent).toContain("Could not confirm event details");
    // The previous search's single result must not stand in as this search's answer.
    expect(screen.queryByTestId("guest-event-results-count")).toBeNull();
    expect(cardTitles()).toHaveLength(2);

    fetchMock.mockResolvedValueOnce(ok([B]));
    await user.click(screen.getByTestId("events-lookup-retry"));
    await screen.findByTestId("guest-event-results-count");
    expect(screen.queryByTestId("events-lookup-error")).toBeNull();
    expect(cardTitles()).toHaveLength(1);
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("ids=b"), expect.anything());
  });

  it("a slow older response can never replace a newer search", async () => {
    render(<EventBrowseView {...props} results={[A, B]} />);
    let releaseOld!: (r: Response) => void;
    fetchMock
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
        releaseOld = resolve;
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }))
      .mockResolvedValueOnce(ok([B]));
    search(["a"]);
    search(["b"]);
    await screen.findByTestId("guest-event-results-count");
    releaseOld(ok([A])); // the old answer arrives last
    await act(async () => { await Promise.resolve(); });
    const titles = cardTitles();
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain("Event B");
    expect(screen.queryByTestId("events-lookup-error")).toBeNull();
  });
});
