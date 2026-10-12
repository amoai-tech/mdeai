// @vitest-environment jsdom
/**
 * SAN-407 — answer first, refine second. Runs the real rental fast-path hook against the real
 * local-chat and fast-path contexts; only the network, the map and the agent state are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: undefined, state: {}, setState: vi.fn() }),
}));
const map = vi.hoisted(() => ({ merges: [] as Array<[string, unknown[]]> }));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({
    mergePinsByCategory: (category: string, pins: unknown[]) => {
      map.merges.push([category, pins]);
    },
    requestFitBounds: vi.fn(),
  }),
}));

import {
  EventLocalChatProvider,
  useEventLocalChat,
} from "@/components/chat/event-local-chat-context";
import { EventFastPathProvider } from "@/components/chat/event-fast-path-context";
import { EventSearchResultsProvider } from "@/components/chat/event-search-results-context";
import { GroundedFastPathProvider } from "@/components/chat/grounded-fast-path-context";
import { RentalFastPathProvider, useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { RestaurantFastPathProvider } from "@/components/chat/restaurant-fast-path-context";
import { useRentalSearchFastPath } from "@/hooks/use-rental-search-fast-path";

type Probe = {
  send: (text: string) => Promise<boolean>;
  messages: () => Array<{ role: string; content: string }>;
  clarifyPending: () => boolean;
  hasResult: () => boolean;
};
let probe: Probe;

function Harness() {
  const { handleUserMessage } = useRentalSearchFastPath();
  const local = useEventLocalChat();
  const rental = useRentalFastPath();
  useEffect(() => {
    probe = {
      send: handleUserMessage,
      messages: () => local.messages as Array<{ role: string; content: string }>,
      clarifyPending: () => local.clarifyPending,
      hasResult: () => rental.toolResult != null,
    };
  });
  return null;
}

let root: Root;
let container: HTMLElement;
const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

beforeEach(() => {
  map.merges.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
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

async function send(text: string) {
  let handled = false;
  await act(async () => {
    handled = await probe.send(text);
  });
  return handled;
}

const assistantText = () =>
  probe.messages().filter((m) => m.role === "assistant").map((m) => m.content).join("\n");

describe("SAN-407 · rental chat searches before it asks", () => {
  it("'Search apartments Medellín' calls the search once and shows no clarify form", async () => {
    respond(200, { results: [] });
    const handled = await send("Search apartments Medellín");
    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rentals/search");
    expect(probe.clarifyPending()).toBe(false);
    expect(assistantText()).not.toMatch(/what dates, budget/i);
  });

  it("a true empty marketplace is an honest answer with zero pins", async () => {
    respond(200, { results: [] });
    await send("Show me apartments in Medellín");
    expect(assistantText()).toMatch(/no verified rentals/i);
    // Whatever was merged for the rental category must be empty (clears any stale pins).
    const rentalMerges = map.merges.filter(([category]) => category === "rental");
    expect(rentalMerges.every(([, pins]) => pins.length === 0)).toBe(true);
  });

  it("a search outage says unavailable, is handled here, and is NOT passed to the agent", async () => {
    respond(503, { error: "rental_search_unavailable" });
    const handled = await send("Search apartments Medellín");
    // true = this hook answered it; false would hand the same message to the agent for a
    // second, conflicting answer.
    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assistantText()).toMatch(/temporarily unavailable|try again/i);
    expect(assistantText()).not.toMatch(/no verified rentals/i);
    expect(probe.hasResult()).toBe(false);
  });

  it("a network failure is also 'unavailable', not a silent drop", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const handled = await send("2BR Laureles under COP 4M/month");
    expect(handled).toBe(true);
    expect(assistantText()).toMatch(/temporarily unavailable|try again/i);
  });

  it("does not hijack unrelated or ambiguous messages", async () => {
    expect(await send("salsa events this weekend")).toBe(false);
    expect(await send("help me find a place")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a constrained prompt keeps the renter's own filters and sends no invented budget", async () => {
    respond(200, { results: [] });
    await send("2BR Laureles under COP 4M/month");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.neighborhood).toBe("Laureles");
    expect(body.minBedrooms).toBe(2);
    expect(body.maxPricePerNight).toBeUndefined();
  });
});
