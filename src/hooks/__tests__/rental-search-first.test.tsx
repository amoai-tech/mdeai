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
/** Messages the hook gave back to the sender (the real chat sends these to the concierge). */
const unhandled: string[] = [];
/** When set, the hand-off to the concierge throws, as a failed network call would. */
let handoffThrows = false;

function Harness() {
  const { handleUserMessage } = useRentalSearchFastPath({
    onUnhandled: (text) => {
      unhandled.push(text);
      if (handoffThrows) throw new Error("concierge unreachable");
      return true;
    },
  });
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
// SAN-1531 persists local chat messages in a separate background POST.
// Count only the actual rental-search endpoint in these SAN-407 assertions.
const fetchMock = vi.fn();
const historySaveMock = vi.fn(async () =>
  new Response(JSON.stringify({ saved: 2 }), { status: 200 }),
);

function respond(status: number, body: unknown) {
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

beforeEach(() => {
  map.merges.length = 0;
  unhandled.length = 0;
  handoffThrows = false;
  fetchMock.mockReset();
  historySaveMock.mockClear();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/^\/api\/threads\/[0-9a-f-]{36}\/messages$/i.test(url)) {
      return historySaveMock(input, init);
    }
    return fetchMock(input, init);
  });
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
    expect(assistantText()).toMatch(/no rentals are available in this search right now/i);
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
    expect(assistantText()).not.toMatch(/no rentals (are available|match)/i);
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

  it("a 4xx is a request problem, not an outage: it is not called 'temporarily unavailable'", async () => {
    respond(400, { error: "invalid body" });
    const handled = await send("Search apartments Medellín");
    // false = let the concierge handle it; retrying the same request would not help.
    expect(handled).toBe(false);
    expect(assistantText()).not.toMatch(/temporarily unavailable/i);
  });

  it("a malformed answer (bad JSON) is a bug, not an outage: it goes to the concierge", async () => {
    fetchMock.mockImplementation(async () => new Response("{not json", { status: 200 }));
    const handled = await send("Search apartments Medellín");
    expect(handled).toBe(false);
    expect(assistantText()).not.toMatch(/temporarily unavailable/i);
  });

  it("a failed hand-off of a queued message does not stall the messages behind it", async () => {
    handoffThrows = true;
    const search = await startSlowFirstSearch("Search apartments Medellín", { results: [] });
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "x" }), { status: 400 }));
    for (const text of ["Only apartments in Laureles", "apartments in Envigado instead"]) {
      await act(async () => {
        await probe.send(text);
      });
    }
    await search.finish();
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    // Both were tried and handed back even though the first hand-off threw.
    expect(unhandled).toEqual(["Only apartments in Laureles", "apartments in Envigado instead"]);
    // ...and the renter is told, instead of the message silently going unanswered.
    expect(assistantText()).toMatch(/couldn't pass that message along/i);
  });

  it.each([500, 502, 503, 429])("HTTP %i is reported as temporarily unavailable", async (status) => {
    respond(status, { error: "x" });
    const handled = await send("Search apartments Medellín");
    expect(handled).toBe(true);
    expect(assistantText()).toMatch(/temporarily unavailable/i);
  });

  /** Start a first search that stays in flight until `release()` is called. */
  async function startSlowFirstSearch(prompt: string, firstBody: unknown) {
    let release: () => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(JSON.stringify(firstBody), { status: 200 }));
        }),
    );
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = probe.send(prompt);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return {
      finish: async () => {
        await act(async () => {
          release();
          await first;
        });
        // the replay runs after the render that follows the search
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      },
    };
  }

  it("a message sent while a search is running is queued and answered afterwards, not dropped", async () => {
    respond(200, { results: [] });
    const search = await startSlowFirstSearch("Search apartments Medellín", { results: [] });

    let secondHandled = false;
    await act(async () => {
      secondHandled = await probe.send("Actually only apartments in Laureles");
    });
    expect(secondHandled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await search.finish();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody.neighborhood).toBe("Laureles");
    expect(secondBody.queryText).toBe("Actually only apartments in Laureles");
    expect(unhandled).toEqual([]);
  });

  it("the replay builds on the first search's filters, not on stale pre-search state", async () => {
    respond(200, { results: [] });
    const search = await startSlowFirstSearch("2BR apartments in Laureles", { results: [] });

    await act(async () => {
      await probe.send("only under $80 per night");
    });
    await search.finish();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    // Both come from the FIRST search; the stubbed co-agent state is always empty, so only the
    // memory the first search just wrote can supply them.
    expect(secondBody.neighborhood).toBe("Laureles");
    expect(secondBody.minBedrooms).toBe(2);
    expect(secondBody.maxPricePerNight).toBe(80);
  });

  it("a queued message the fast path cannot answer is handed to the concierge, not lost", async () => {
    respond(400, { error: "invalid body" });
    const search = await startSlowFirstSearch("Search apartments Medellín", { results: [] });

    let handled = false;
    await act(async () => {
      handled = await probe.send("Actually only apartments in Laureles");
    });
    expect(handled).toBe(true); // reported handled to the sender while queued
    await search.finish();

    expect(fetchMock).toHaveBeenCalledTimes(2); // the replay tried the search...
    expect(unhandled).toEqual(["Actually only apartments in Laureles"]); // ...and gave it back
  });

  it("a refinement keeps the monthly meaning of the first search", async () => {
    respond(200, { results: [] });
    const search = await startSlowFirstSearch("monthly stay in El Poblado under $2000 per month", {
      results: [],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).stayType).toBe("monthly");

    await act(async () => {
      await probe.send("Only apartments in Laureles");
    });
    await search.finish();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(second.neighborhood).toBe("Laureles");
    expect(second.stayType).toBe("monthly"); // dropped before: the refinement ran as an unlabelled search
  });

  it("a replay that is answered is not also sent to the concierge", async () => {
    respond(200, { results: [] });
    const search = await startSlowFirstSearch("Search apartments Medellín", { results: [] });
    await act(async () => {
      await probe.send("Actually only apartments in Laureles");
    });
    await search.finish();
    expect(unhandled).toEqual([]);
  });

  it("several messages sent while a search runs are ALL answered, in the order they were sent", async () => {
    respond(200, { results: [] });
    const search = await startSlowFirstSearch("Search apartments Medellín", { results: [] });

    for (const text of ["Only apartments in Laureles", "apartments in Envigado instead", "apartments in Belén then"]) {
      let handled = false;
      await act(async () => {
        handled = await probe.send(text);
      });
      expect(handled).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing runs concurrently

    await search.finish();
    // each replay runs after the previous search ends; give the chain time to drain
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const texts = fetchMock.mock.calls
      .slice(1)
      .map((call) => JSON.parse(String(call[1]?.body)).queryText);
    expect(texts).toEqual(["Only apartments in Laureles", "apartments in Envigado instead", "apartments in Belén then"]);
    expect(unhandled).toEqual([]);
  });

  it("a full waiting queue hands the overflow message to the concierge instead of dropping it", async () => {
    respond(200, { results: [] });
    await startSlowFirstSearch("Search apartments Medellín", { results: [] });

    const results: boolean[] = [];
    for (let i = 1; i <= 12; i += 1) {
      await act(async () => {
        results.push(await probe.send(`apartments in Laureles number ${i}`));
      });
    }
    // 10 are kept (handled=true); the rest are declined (false) so the sender routes them to the
    // concierge — none is silently lost.
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results.filter((value) => !value)).toHaveLength(2);
  });
});

