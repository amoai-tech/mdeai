// @vitest-environment jsdom
/**
 * SAN-966 — the latest search must be the only result panel left in the transcript tail.
 * Each vertical's fast-path hook used to clear a different subset of its peers, so
 * restaurant → rental left the restaurant panel, and grounded → event left the grounded panel.
 * These run the real hooks against the real contexts; only the network, the map and the agent
 * are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: undefined, state: {}, setState: vi.fn() }),
}));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ mergePinsByCategory: vi.fn(), requestFitBounds: vi.fn() }),
}));

import { EventFastPathProvider, useEventFastPath } from "@/components/chat/event-fast-path-context";
import { EventLocalChatProvider } from "@/components/chat/event-local-chat-context";
import {
  EventSearchResultsProvider,
  useEventSearchResults,
} from "@/components/chat/event-search-results-context";
import { GroundedFastPathProvider, useGroundedFastPath } from "@/components/chat/grounded-fast-path-context";
import { RentalFastPathProvider, useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { RestaurantFastPathProvider, useRestaurantFastPath } from "@/components/chat/restaurant-fast-path-context";
import { useEventSearchFastPath } from "@/hooks/use-event-search-fast-path";
import { useGroundedSearchFastPath } from "@/hooks/use-grounded-search-fast-path";
import { useRentalSearchFastPath } from "@/hooks/use-rental-search-fast-path";
import { useRestaurantSearchFastPath } from "@/hooks/use-restaurant-search-fast-path";

// Specific enough to search straight away (a generic restaurant ask clarifies first).
const QUERY = {
  rental: "1BR apartment in Laureles under 80 dollars per night",
  event: "salsa events this weekend",
  grounded: "best cafes medellin",
  restaurant: "Italian restaurants in Poblado",
} as const;

type Vertical = keyof typeof QUERY;

type Probe = {
  send: Record<Vertical, (text: string) => Promise<unknown>>;
  shown: () => Vertical[];
  citations: () => number;
  seedCitation: () => void;
};

let probe: Probe;

function Harness() {
  const rental = useRentalFastPath();
  const event = useEventFastPath();
  const grounded = useGroundedFastPath();
  const restaurant = useRestaurantFastPath();
  const { webCitations, setWebCitations } = useEventSearchResults();
  const rentalSend = useRentalSearchFastPath().handleUserMessage;
  const eventSend = useEventSearchFastPath().handleUserMessage;
  const groundedSend = useGroundedSearchFastPath().handleUserMessage;
  const restaurantSend = useRestaurantSearchFastPath().handleUserMessage;
  useEffect(() => {
    probe = {
      send: { rental: rentalSend, event: eventSend, grounded: groundedSend, restaurant: restaurantSend },
      shown: () =>
        (
          [
            ["rental", rental.toolResult],
            ["event", event.toolResult],
            ["grounded", grounded.toolResult],
            ["restaurant", restaurant.toolResult],
          ] as const
        )
          .filter(([, value]) => value != null)
          .map(([name]) => name),
      citations: () => webCitations.length,
      seedCitation: () => setWebCitations([{ title: "Source", url: "https://example.com/a" }]),
    };
  });
  return null;
}

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <EventLocalChatProvider>
        <EventSearchResultsProvider>
          <RentalFastPathProvider>
            <EventFastPathProvider>
              <GroundedFastPathProvider>
                <RestaurantFastPathProvider>
                  <Harness />
                </RestaurantFastPathProvider>
              </GroundedFastPathProvider>
            </EventFastPathProvider>
          </RentalFastPathProvider>
        </EventSearchResultsProvider>
      </EventLocalChatProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function search(vertical: Vertical) {
  await act(async () => {
    await probe.send[vertical](QUERY[vertical]);
  });
}

describe("only the latest search's results stay in the tail", () => {
  it("restaurant → rental leaves only the rental results", async () => {
    await search("restaurant");
    expect(probe.shown()).toEqual(["restaurant"]);
    await search("rental");
    expect(probe.shown()).toEqual(["rental"]);
  });

  it("grounded → event leaves only the event results", async () => {
    await search("grounded");
    expect(probe.shown()).toEqual(["grounded"]);
    await search("event");
    expect(probe.shown()).toEqual(["event"]);
  });

  it("every ordered pair of different searches leaves only the second", async () => {
    const all = Object.keys(QUERY) as Vertical[];
    for (const first of all) {
      for (const second of all.filter((v) => v !== first)) {
        await search(first);
        expect(probe.shown(), `${first} landed`).toEqual([first]);
        await search(second);
        expect(probe.shown(), `${first} → ${second}`).toEqual([second]);
      }
    }
  });

  it("a different search also drops the event source citations", async () => {
    await search("event");
    act(() => probe.seedCitation());
    expect(probe.citations()).toBe(1);
    await search("rental");
    expect(probe.citations()).toBe(0);
  });

  it("repeating the same search keeps its results", async () => {
    await search("rental");
    await search("rental");
    expect(probe.shown()).toEqual(["rental"]);
  });
});
