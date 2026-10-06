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
// The map keeps one pin list per category; this stands in for it so the test can see which remain.
const map = vi.hoisted(() => ({ pins: new Map<string, unknown[]>() }));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({
    mergePinsByCategory: (category: string, incoming: unknown[]) => {
      map.pins.set(category, incoming);
    },
    requestFitBounds: vi.fn(),
  }),
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

// One result with coordinates per search, so each search puts one pin on the map.
const FIXTURE_BY_URL: Record<string, unknown> = {
  "/api/rentals/search": { results: [{ id: "r1", title: "1BR", neighborhood: "Laureles", nightly_price: 55, currency: "USD", bedrooms: 1, wifi: true, amenities: [], image: "", source_url: "https://mdeai.co/r/1", host_name: "QA", availability: "now", tags: [], latitude: 6.25, longitude: -75.59 }] },
  "/api/events/search": { results: [{ id: "e1", title: "Salsa", category: "music", venue: "Club", neighborhood: "Poblado", startsAt: "2026-10-10T01:00:00.000Z", pricePerTicket: 15, currency: "USD", imageUrl: "", sourceUrl: "https://mdeai.co/e/1", latitude: 6.2088, longitude: -75.5671 }] },
  "/api/restaurants/search": { results: [{ id: "s1", name: "Bistro", cuisine: "italian", neighborhood: "Poblado", priceTier: "$$", avgPricePerPerson: 24, currency: "USD", rating: 4.8, vibe: [], imageUrl: "", sourceUrl: "https://mdeai.co/s/1", latitude: 6.2098, longitude: -75.5663 }] },
  "/api/grounded/search": { results: [{ id: "g1", title: "Coffee", mapsUrl: "https://maps.google.com/?cid=1", directionsUrl: "https://x", reviewsUrl: "https://x", latitude: 6.2442, longitude: -75.5812, placeId: "X", rating: 4.7, userRatingCount: 3, priceLevel: "PRICE_LEVEL_MODERATE", openNow: true, formattedAddress: "Laureles", primaryType: "coffee_shop", summary: "s", fieldMaskVersion: "places-v1" }], attribution: [], metadata: { venueKind: "cafe" } },
};
const FIXTURE = new Map(Object.entries(FIXTURE_BY_URL));

beforeEach(() => {
  map.pins.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(JSON.stringify(FIXTURE.get(url) ?? { results: [] }), { status: 200 })),
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
    // A switch, not `probe.send[vertical]`: every call target is a fixed, named function.
    switch (vertical) {
      case "rental": await probe.send.rental(QUERY.rental); break;
      case "event": await probe.send.event(QUERY.event); break;
      case "grounded": await probe.send.grounded(QUERY.grounded); break;
      case "restaurant": await probe.send.restaurant(QUERY.restaurant); break;
    }
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

  it("the map keeps only the latest search's pins (no pins from earlier kinds)", async () => {
    const pinCategories = () => [...map.pins].filter(([, pins]) => pins.length > 0).map(([c]) => c);
    const all = Object.keys(QUERY) as Vertical[];
    for (const first of all) {
      for (const second of all.filter((v) => v !== first)) {
        await search(first);
        await search(second);
        expect(pinCategories(), `${first} → ${second}`).toEqual([second]);
      }
    }
  });

  it("repeating the same search keeps its results", async () => {
    await search("rental");
    await search("rental");
    expect(probe.shown()).toEqual(["rental"]);
  });
});

// SAN-1422 · Make map results truthful and clear stale pins when results have no coordinates.
describe("a finished search with no mappable results clears that category's old pins", () => {
  const URL_BY_VERTICAL = {
    rental: "/api/rentals/search",
    event: "/api/events/search",
    grounded: "/api/grounded/search",
    restaurant: "/api/restaurants/search",
  } as const;

  /** Same cards, coordinates removed — the cards stay usable but nothing can be pinned. */
  function withoutCoordinates(body: unknown): unknown {
    const { results, ...rest } = body as { results: Array<Record<string, unknown>> };
    return {
      ...rest,
      results: results.map((row) => {
        const copy = { ...row };
        delete copy.latitude;
        delete copy.longitude;
        return copy;
      }),
    };
  }

  const savedFixtures = new Map(FIXTURE);
  afterEach(() => {
    for (const [url, body] of savedFixtures) FIXTURE.set(url, body);
  });

  for (const vertical of ["rental", "event", "grounded", "restaurant"] as const) {
    it(`${vertical}: mapped search → same search with no coordinates leaves no ${vertical} pins`, async () => {
      await search(vertical);
      expect(map.pins.get(vertical)).toHaveLength(1);

      const url = URL_BY_VERTICAL[vertical];
      FIXTURE.set(url, withoutCoordinates(FIXTURE_BY_URL[url]));
      await search(vertical);
      expect(probe.shown()).toEqual([vertical]);
      expect(map.pins.get(vertical)).toEqual([]);
    });

    it(`${vertical}: mapped search → zero results leaves no ${vertical} pins`, async () => {
      await search(vertical);
      expect(map.pins.get(vertical)).toHaveLength(1);

      FIXTURE.set(URL_BY_VERTICAL[vertical], { results: [] });
      await search(vertical);
      expect(map.pins.get(vertical)).toEqual([]);
    });
  }
});

// SAN-1422 — a grounded search that finds nothing to pin must not erase other kinds' pins.
describe("a grounded search with nothing to pin leaves the other kinds' pins alone", () => {
  const savedFixtures = new Map(FIXTURE);
  afterEach(() => {
    for (const [url, body] of savedFixtures) FIXTURE.set(url, body);
  });

  const emptyGrounded = () => FIXTURE.set("/api/grounded/search", { results: [], attribution: [], metadata: { venueKind: "cafe" } });
  const coordinateLessGrounded = () => {
    const row = { ...(FIXTURE_BY_URL["/api/grounded/search"] as { results: Array<Record<string, unknown>> }).results[0]! };
    delete row.latitude;
    delete row.longitude;
    FIXTURE.set("/api/grounded/search", { results: [row], attribution: [], metadata: { venueKind: "cafe" } });
  };

  for (const kept of ["rental", "event"] as const) {
    for (const [label, arrange] of [
      ["no results", emptyGrounded],
      ["results without coordinates", coordinateLessGrounded],
    ] as const) {
      it(`${kept} pin → grounded search with ${label} → the ${kept} pin stays, the grounded panel replaces the ${kept} panel`, async () => {
        await search(kept);
        expect(map.pins.get(kept)).toHaveLength(1);

        arrange();
        await search("grounded");

        expect(map.pins.get(kept), `${kept} pin must survive`).toHaveLength(1);
        expect(map.pins.get("grounded")).toEqual([]);
        expect(probe.shown()).toEqual(["grounded"]);
      });
    }
  }

  it("a grounded search WITH pins still replaces the other kinds' pins", async () => {
    await search("rental");
    await search("grounded");
    expect(map.pins.get("rental")).toEqual([]);
    expect(map.pins.get("grounded")).toHaveLength(1);
  });
});

