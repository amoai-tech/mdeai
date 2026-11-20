// @vitest-environment jsdom
/**
 * SAN-407 — answer first, refine second. Runs the real rental fast-path hook against the real
 * local-chat and fast-path contexts; only the network, the map and the agent state are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const coagent = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  listeners: new Set<() => void>(),
}));
vi.mock("@/components/chat/concierge-coagent-context", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useConciergeCoAgent: () => ({
      agent: undefined,
      // Read the *reactive* CoAgent snapshot: production rerenders after setState.
      // A plain mutable object concealed that rerender, reusing stale closures in tests.
      state: useSyncExternalStore(
        (listener) => {
          coagent.listeners.add(listener);
          return () => { coagent.listeners.delete(listener); };
        },
        () => coagent.state,
      ),
      setState: (update: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => {
        coagent.state = typeof update === "function" ? update(coagent.state) : update;
        for (const listener of coagent.listeners) listener();
      },
    }),
  };
});
const map = vi.hoisted(() => ({ merges: [] as Array<[string, unknown[]]>, throwRentalMergeOnce: false }));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({
    mergePinsByCategory: (category: string, pins: unknown[]) => {
      if (category === "rental" && map.throwRentalMergeOnce) {
        map.throwRentalMergeOnce = false;
        throw new Error("simulated results display failure");
      }
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
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";

type Probe = {
  send: (text: string) => Promise<boolean>;
  messages: () => Array<{ role: string; content: string }>;
  clarifyPending: () => boolean;
  showClarify: (kind: "event" | "restaurant") => void;
  isSearchPending: () => boolean;
  hasResult: () => boolean;
  failure: () => { code: string; retryable: boolean } | null;
  previousQuery: () => string | undefined;
  hasListing: (id: string) => boolean;
  reset: () => void;
  restoreSearch: (params: { neighborhood?: string; minBedrooms?: number; maxBedrooms?: number; furnished?: boolean; maxPriceMonthly?: number; budgetCurrency?: "COP" | "USD"; stayType?: "monthly" }) => void;
};
let probe: Probe;
/** Messages the hook gave back to the sender (the real chat sends these to the concierge). */
const unhandled: string[] = [];
/** When set, the hand-off to the concierge throws, as a failed network call would. */
let handoffThrows = false;

function Harness() {
  const { handleUserMessage, hasPendingSearch } = useRentalSearchFastPath({
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
      showClarify: (kind) => local.showClarify("Clarify", "Which date?", kind),
      isSearchPending: hasPendingSearch,
      hasResult: () => rental.toolResult != null,
      failure: () => rental.searchFailure,
      previousQuery: () => rental.searchMeta?.userText,
      hasListing: (id) => JSON.stringify(rental.toolResult).includes(id),
      // New Chat does both: clear the cards AND scope memory to the new conversation.
      // Mirrors ConciergeSessionProvider.startNewChat: reset chat memory, clear cards,
      // and scope the new conversation so nothing from the old one survives.
      reset: () => {
        coagent.state = {};
        rental.clearToolResults();
        rental.bumpSessionEpoch();
      },
      restoreSearch: (params) => rental.setSearchMeta({ userText: "Saved rental search", params, source: "saved" }),
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
  coagent.state = {};
  map.merges.length = 0;
  map.throwRentalMergeOnce = false;
  unhandled.length = 0;
  handoffThrows = false;
  fetchMock.mockReset();
  historySaveMock.mockClear();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/^\/api\/threads\/[0-9a-f-]{36}\/messages$/i.test(url)) {
      return historySaveMock();
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

  it("keeps a guest COP budget refinement on the real fast-path instead of handing it to sign-in", async () => {
    respond(200, { results: [] });
    expect(await send("Only show apartments under COP 3 million per month")).toBe(true);
    expect(await send("Now only under COP 2.5 million per month")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(unhandled).toEqual([]);
    const next = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(next.maxPriceMonthly).toBe(2_500_000);
    expect(next.budgetCurrency).toBe("COP");
    expect(next.maxPricePerNight).toBeUndefined();
    // The second budget narrows the first search's actual candidate set,
    // rather than rediscovering unrelated apartments through new query text.
    expect(next.queryText).toBe("Only show apartments under COP 3 million per month");
  });

  it("keeps furnished, Laureles, and 2BR when lowering only the monthly price", async () => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    const initial = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(initial).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, furnished: true,
      maxPriceMonthly: 3_000_000, budgetCurrency: "COP",
    });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const refined = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(refined).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, furnished: true,
      maxPriceMonthly: 2_500_000, budgetCurrency: "COP",
    });
  });

  it("restores furnishing from matching visible metadata for a legacy saved thread", async () => {
    respond(200, { results: [] });
    Object.assign(coagent.state, { lastIntent: "rental_search", lastRentalQuery: {
      neighborhood: "Laureles", minBedrooms: 2, maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP", budgetType: "monthly",
      // A legacy saved thread did not persist the furnished field.
    } });
    await act(async () => probe.restoreSearch({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, furnished: true,
      maxPriceMonthly: 3_000_000, budgetCurrency: "COP", stayType: "monthly",
    }));
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const next = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(next).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, furnished: true,
      maxPriceMonthly: 2_500_000, budgetCurrency: "COP",
    });
  });

  it("clear-only furnishing retains Laureles and exact 2BR for the next budget-only request", async () => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The clear is memory-only, not a new search that could overwrite location/bedrooms.
    expect(await send("either furnished or unfurnished is fine")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(coagent.state.lastRentalQuery).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      furnished: null, furnishingCleared: true, maxPriceMonthly: 3_000_000,
    });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const refined = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(refined.furnished).toBeUndefined();
    expect(refined.neighborhood).toBe("Laureles");
    expect(refined.maxPriceMonthly).toBe(2_500_000);
    expect(refined.minBedrooms).toBe(2);
    expect(refined.maxBedrooms).toBe(2);
  });

  it("an old conversation search failure cannot install Retry or show an error in New Chat", async () => {
    let rejectOld: (error: unknown) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => {
      rejectOld = reject;
    }));
    let oldSearch: Promise<boolean> = Promise.resolve(false);
    await act(async () => { oldSearch = probe.send("Search apartments in Laureles under COP 3 million"); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { probe.reset(); });
    await act(async () => { rejectOld(new TypeError("simulated network failure")); await oldSearch; });
    expect(probe.failure()).toBeNull();
    expect(assistantText()).not.toMatch(/temporarily unavailable/i);
    respond(200, { results: [] });
    expect(await send("Show apartments in Envigado")).toBe(true);
    const current = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(current.neighborhood).toBe("Envigado");
    expect(current.maxPriceMonthly).toBeUndefined();
  });

  it("a saved explicit-clear marker blocks the old visible furnished filter after reload", async () => {
    respond(200, { results: [] });
    await act(async () => {
      coagent.state = { lastIntent: "rental_search", lastRentalQuery: {
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
        maxPriceMonthly: 3_000_000, budgetCurrency: "COP", budgetType: "monthly",
        // Mastra deletes furnished:null; this sentinel survives the saved-memory roundtrip.
        furnishingCleared: true,
      } };
      for (const listener of coagent.listeners) listener();
      probe.restoreSearch({
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, furnished: true,
        maxPriceMonthly: 3_000_000, budgetCurrency: "COP", stayType: "monthly",
      });
    });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const refined = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refined.furnished).toBeUndefined();
    expect(refined.minBedrooms).toBe(2);
    expect(refined.maxBedrooms).toBe(2);
  });

  it("does not erase a newer concierge-authored furnished preference on a live unfiltered result", async () => {
    respond(200, { results: [] });
    expect(await send("Find 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    // This was a real live unfiltered search, NOT a saved-thread hydration.
    await act(async () => {
      const prior = coagent.state.lastRentalQuery as Record<string, unknown>;
      coagent.state = { ...coagent.state, lastRentalQuery: {
        ...prior, furnished: true, furnishingCleared: false,
      } };
      for (const listener of coagent.listeners) listener();
    });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const next = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(next).toMatchObject({ neighborhood: "Laureles", furnished: true, maxPriceMonthly: 2_500_000 });
  });

  it("does not keep trusting saved cards after a later concierge-authored furnishing change", async () => {
    respond(200, { results: [] });
    await act(async () => {
      probe.reset();
      coagent.state = { lastIntent: "rental_search", lastRentalQuery: {
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
        furnished: true, furnishingCleared: false,
        maxPriceMonthly: 2_400_000, budgetCurrency: "COP", budgetType: "monthly",
      } };
      for (const listener of coagent.listeners) listener();
      probe.restoreSearch({
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
        maxPriceMonthly: 2_400_000, budgetCurrency: "COP", stayType: "monthly",
      });
    });
    // This follow-up falls through to the concierge. The corrected checkpoint
    // MUST already be exported by setState before the caller invokes the agent,
    // not merely be fixed when a later rental search constructs its API body.
    expect(await send("What about the balcony?")).toBe(false);
    expect(coagent.state.lastRentalQuery).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 2_400_000, furnished: null, furnishingCleared: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // The concierge now writes a NEW explicit preference after saved hydration.
    await act(async () => {
      coagent.state = { ...coagent.state, lastRentalQuery: {
        ...(coagent.state.lastRentalQuery as Record<string, unknown>),
        furnished: true, furnishingCleared: false,
      } };
      for (const listener of coagent.listeners) listener();
    });
    expect(await send("Only under COP 2.3 million")).toBe(true);
    const refined = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refined).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 2_300_000, furnished: true,
    });
  });

  it("uses the last saved unfiltered result rather than a stale furnished CoAgent snapshot", async () => {
    respond(200, { results: [] });
    await act(async () => {
      probe.reset();
      // A persisted agent checkpoint can predate a newer saved result, whose
      // actual search omitted furnished after the renter cleared that preference.
      coagent.state = { lastIntent: "rental_search", lastRentalQuery: {
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
        furnished: true, furnishingCleared: false,
        maxPriceMonthly: 2_400_000, budgetCurrency: "COP", budgetType: "monthly",
      } };
      for (const listener of coagent.listeners) listener();
      probe.restoreSearch({
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
        maxPriceMonthly: 2_400_000, budgetCurrency: "COP", stayType: "monthly",
      });
    });
    expect(await send("Only under COP 2.3 million")).toBe(true);
    const params = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(params).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 2_300_000, budgetCurrency: "COP",
    });
    expect(params.furnished).toBeUndefined();
    // An explicit new choice still outranks the saved unfiltered result.
    expect(await send("Actually furnished apartments")).toBe(true);
    const explicit = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(explicit.furnished).toBe(true);
  });

  it("a later explicit unfurnished preference overrides a deliberate clear", async () => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(await send("either furnished or unfurnished is fine")).toBe(false);
    expect(await send("Actually show unfurnished apartments")).toBe(true);
    const remembered = coagent.state.lastRentalQuery as { furnished?: boolean | null; furnishingCleared?: boolean };
    expect(remembered).toMatchObject({ furnished: false, furnishingCleared: false });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const refined = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refined.furnished).toBe(false);
  });

  it("New Chat can start a second search before the old request resolves", async () => {
    const oldCard = { id: "old-laureles-id", title: "Old Laureles", neighborhood: "Laureles",
      bedrooms: 2, price_monthly: 3_000_000, currency: "COP", latitude: 6.25, longitude: -75.59 };
    const newCard = { ...oldCard, id: "new-envigado-id", title: "New Envigado", neighborhood: "Envigado" };
    let releaseOld: () => void = () => undefined;
    let releaseNew: () => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      releaseOld = () => resolve(new Response(JSON.stringify({ results: [oldCard] }), { status: 200 }));
    }));
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      releaseNew = () => resolve(new Response(JSON.stringify({ results: [newCard] }), { status: 200 }));
    }));
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    await act(async () => { first = probe.send("Show apartments in Laureles"); });
    await act(async () => { probe.reset(); });
    await act(async () => { second = probe.send("Show apartments in Envigado"); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Old request settles first but must never publish or unlock the active newer request.
    await act(async () => { releaseOld(); await first; });
    expect(probe.hasListing(oldCard.id)).toBe(false);
    await act(async () => { releaseNew(); await second; });
    expect(probe.hasListing(newCard.id)).toBe(true);
    expect(probe.hasListing(oldCard.id)).toBe(false);
    const next = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(next.neighborhood).toBe("Envigado");
  });

  it("a queued old-chat follow-up is discarded when New Chat starts", async () => {
    let releaseOld: () => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      releaseOld = () => resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    }));
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => { first = probe.send("Show apartments in Laureles under COP 3 million"); });
    await act(async () => { expect(await probe.send("Show apartments in Envigado")).toBe(true); });
    await act(async () => { probe.reset(); });
    await act(async () => { releaseOld(); await first; });
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(probe.hasResult()).toBe(false);
  });

  it("a clear-only turn supersedes a pending same-chat furnished search", async () => {
    let releasePending: () => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      releasePending = () => resolve(new Response(JSON.stringify({ results: [{
        id: "stale-furnished", title: "Old apartment", neighborhood: "Laureles", bedrooms: 2,
        furnished: true, price_monthly: 3_000_000, currency: "COP",
      }] }), { status: 200 }));
    }));
    let pending: Promise<boolean> = Promise.resolve(false);
    await act(async () => { pending = probe.send("Find furnished 2-bedroom apartments in Laureles under COP 3 million"); });
    expect(await send("either furnished or unfurnished is fine")).toBe(false);
    const cleared = coagent.state.lastRentalQuery as { furnished?: boolean | null; furnishingCleared?: boolean };
    expect(cleared).toMatchObject({ furnished: null, furnishingCleared: true });
    await act(async () => { releasePending(); await pending; });
    expect(probe.hasListing("stale-furnished")).toBe(false);
    expect(probe.messages().some((message) =>
      message.role === "user" &&
      message.content === "Find furnished 2-bedroom apartments in Laureles under COP 3 million",
    )).toBe(true);
    expect(assistantText()).toMatch(/set aside those results because you changed your furnishing preference/i);
    expect((coagent.state.lastRentalQuery as { furnishingCleared?: boolean }).furnishingCleared).toBe(true);

    respond(200, { results: [] });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const refined = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refined.furnished).toBeUndefined();
    expect(refined.maxPriceMonthly).toBe(2_500_000);
  });

  it("an unmounted fast-path hook cannot publish the old request to its still-mounted provider", async () => {
    let releasePending: () => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      releasePending = () => resolve(new Response(JSON.stringify({ results: [{
        id: "old-mounted-request", title: "Older apartment", neighborhood: "Laureles",
        bedrooms: 2, furnished: true, price_monthly: 3_000_000, currency: "COP",
      }] }), { status: 200 }));
    }));
    let pending: Promise<boolean> = Promise.resolve(false);
    await act(async () => { pending = probe.send("Find furnished 2-bedroom apartments in Laureles under COP 3 million"); });
    // Parent providers survive; only the hook-owning child is replaced.
    await act(async () => {
      root.render(
        <EventLocalChatProvider><EventSearchResultsProvider><RentalFastPathProvider>
          <EventFastPathProvider><GroundedFastPathProvider><RestaurantFastPathProvider>
            <Harness key="replacement" />
          </RestaurantFastPathProvider></GroundedFastPathProvider></EventFastPathProvider>
        </RentalFastPathProvider></EventSearchResultsProvider></EventLocalChatProvider>,
      );
    });
    await act(async () => { releasePending(); await pending; });
    expect(probe.hasListing("old-mounted-request")).toBe(false);
    expect(probe.hasResult()).toBe(false);
  });

  it("SAN-1445 full router → rental memory → agent fallback → stale checkpoint → cheaper search", async () => {
    respond(200, { results: [] });
    const agentSend = vi.fn(async () => {
      // Real agent sees the synchronized explicit clear BEFORE starting.
      expect(coagent.state.lastRentalQuery).toMatchObject({
        furnished: null, furnishingCleared: true,
      });
      // Simulate older server checkpoint arriving as part of the agent run.
      await act(async () => {
        coagent.state = { ...coagent.state, lastRentalQuery: {
          ...(coagent.state.lastRentalQuery as Record<string, unknown>),
          furnished: true, furnishingCleared: false,
        } };
        for (const listener of coagent.listeners) listener();
      });
      return true;
    });
    const handlers = {
      inRentalSearch: true,
      lastIntent: "rental_search" as const,
      handleRentalMessage: (text: string) => probe.send(text),
      handleEventMessage: async () => false,
      handleGroundedMessage: async () => false,
      handleRestaurantMessage: async () => false,
      onAgentSend: agentSend,
    };
    const throughRouter = async (text: string) => {
      let handled = false;
      await act(async () => { handled = await sendConciergeUserMessage(text, handlers); });
      return handled;
    };
    expect(await throughRouter("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(await throughRouter("Only under COP 2.5 million")).toBe(true);
    expect(await throughRouter("Either furnished or unfurnished is fine")).toBe(true);
    expect(agentSend).toHaveBeenCalledOnce();
    // The agent asserted it received the clear, then replayed its stale checkpoint.
    expect(coagent.state.lastRentalQuery).toMatchObject({
      furnished: true, furnishingCleared: false, neighborhood: "Laureles",
      minBedrooms: 2, maxBedrooms: 2, maxPriceMonthly: 2_500_000,
    });
    // Agent mock replayed stale state *during* the agent turn; next refinement
    // must recover the user's newer clear, never trust the stale checkpoint.
    expect(await throughRouter("Only under COP 2.4 million")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refined = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refined).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 2_400_000, budgetCurrency: "COP",
    });
    expect(refined.furnished).toBeUndefined();
  });

  it.each(["event", "restaurant"] as const)(
    "SAN-1445 saves a furnishing clear even during %s clarification",
    async (kind) => {
      respond(200, { results: [] });
      expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
      await act(async () => { probe.showClarify(kind); });
      expect(probe.clarifyPending()).toBe(true);
      expect(await send("Either furnished or unfurnished is fine")).toBe(false);
      expect(coagent.state.lastRentalQuery).toMatchObject({
        neighborhood: "Laureles", minBedrooms: 2, furnished: null, furnishingCleared: true,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("SAN-1445 clears a pending first search before cards or CoAgent memory exist", async () => {
    let finish: () => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      finish = () => resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    }));
    let initial: Promise<boolean> = Promise.resolve(false);
    await act(async () => { initial = probe.send("Find furnished 2-bedroom apartments in Laureles under COP 3 million"); });
    expect(probe.isSearchPending()).toBe(true);
    expect(coagent.state.lastRentalQuery).toBeUndefined();

    const agentSend = vi.fn(async () => true);
    const handlers = {
      inRentalSearch: false,
      hasPendingRentalSearch: probe.isSearchPending,
      handleRentalMessage: (text: string) => probe.send(text),
      handleEventMessage: async () => false,
      handleGroundedMessage: async () => false,
      handleRestaurantMessage: async () => false,
      onAgentSend: agentSend,
    };
    await act(async () => {
      expect(await sendConciergeUserMessage("Either furnished or unfurnished is fine", handlers)).toBe(true);
    });
    expect(agentSend).toHaveBeenCalledOnce();
    expect(coagent.state.lastRentalQuery).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 3_000_000, furnished: null, furnishingCleared: true,
    });
    await act(async () => { finish(); await initial; });
    expect(probe.hasResult()).toBe(false);
    respond(200, { results: [] });
    expect(await send("Only under COP 2.4 million")).toBe(true);
    const refined = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refined.furnished).toBeUndefined();
    expect(refined.neighborhood).toBe("Laureles");
    expect(refined.maxPriceMonthly).toBe(2_400_000);
  });

  it("keeps explicit clear after a prior budget search even if CopilotKit replays older furnishing", async () => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(await send("Only under COP 2.5 million")).toBe(true);
    expect(await send("Either furnished or unfurnished is fine")).toBe(false);
    expect(coagent.state.lastRentalQuery).toMatchObject({
      furnished: null, furnishingCleared: true,
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, maxPriceMonthly: 2_500_000,
    });
    // Model/AG-UI replay of the previous server state must not erase a more recent
    // user-authored no-preference command in the *same* conversation.
    await act(async () => {
      const prior = coagent.state.lastRentalQuery as Record<string, unknown>;
      coagent.state = { ...coagent.state, lastRentalQuery: {
        ...prior, furnished: true, furnishingCleared: false,
      } };
      for (const listener of coagent.listeners) listener();
    });
    expect(await send("Only under COP 2.4 million")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const last = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(last).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 2_400_000, budgetCurrency: "COP",
    });
    expect(last.furnished).toBeUndefined();
    // A NEW user choice must beat the previously cleared preference.
    expect(await send("Actually show unfurnished apartments")).toBe(true);
    const unfurnished = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(unfurnished.furnished).toBe(false);
    expect(await send("Only under COP 2.2 million")).toBe(true);
    const refinedUnfurnished = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refinedUnfurnished.furnished).toBe(false);
    expect(refinedUnfurnished.maxPriceMonthly).toBe(2_200_000);
  });

  it("exports an accepted same-thread clear before the pending refinement API completes", async () => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(await send("Either furnished or unfurnished is fine")).toBe(false);
    await act(async () => {
      coagent.state = { ...coagent.state, lastRentalQuery: {
        ...(coagent.state.lastRentalQuery as Record<string, unknown>),
        furnished: true, furnishingCleared: false,
      } };
      for (const listener of coagent.listeners) listener();
    });
    let finish: () => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      finish = () => resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    }));
    let pending: Promise<boolean> = Promise.resolve(false);
    await act(async () => { pending = probe.send("Only under COP 2.5 million"); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Must publish before the async search returns: otherwise a concierge fallback
    // may pick up furnished=true while the corrected request is still pending.
    expect(coagent.state.lastRentalQuery).toMatchObject({
      furnished: null, furnishingCleared: true, neighborhood: "Laureles",
      minBedrooms: 2, maxBedrooms: 2, maxPriceMonthly: 3_000_000,
    });
    await act(async () => { finish(); await pending; });
    const params = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(params.furnished).toBeUndefined();
  });

  it.each([
    ["I prefer unfurnished; can you explain the balcony?", false],
    ["I prefer furnished; can you explain the balcony?", true],
    ["Prefiero amoblado, ¿me explicas el balcón?", true],
    ["Prefiero sin amoblar, ¿me explicas el balcón?", false],
    ["Make it furnished, and what about the balcony?", true],
  ] as const)("newer concierge-chosen %s outranks the older same-thread clear", async (request, furnished) => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(await send("Either furnished or unfurnished is fine")).toBe(false);
    // A direct user request can go to the concierge rather than the fast-path.
    // The agent's next state then reflects this newer explicit preference.
    expect(await send(request)).toBe(false);
    await act(async () => {
      coagent.state = { ...coagent.state, lastRentalQuery: {
        ...(coagent.state.lastRentalQuery as Record<string, unknown>),
        furnished, furnishingCleared: false,
      } };
      for (const listener of coagent.listeners) listener();
    });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const params = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(params).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 2_500_000, furnished,
    });
  });

  it.each([
    "Are furnished places more expensive?",
    "Does the price make furnished units worth it?",
  ])("furnishing price question %s does not undo the renter's clear", async (question) => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(await send("Either furnished or unfurnished is fine")).toBe(false);
    expect(await send(question)).toBe(false);
    // A stale backend snapshot arrives while the concierge answers the question.
    await act(async () => {
      coagent.state = { ...coagent.state, lastRentalQuery: {
        ...(coagent.state.lastRentalQuery as Record<string, unknown>),
        furnished: true, furnishingCleared: false,
      } };
      for (const listener of coagent.listeners) listener();
    });
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const params = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(params.furnished).toBeUndefined();
  });

  it("explicit unfurnished wins directly after restoring older unfiltered saved search", async () => {
    respond(200, { results: [] });
    await act(async () => {
      probe.reset();
      coagent.state = { lastIntent: "rental_search", lastRentalQuery: {
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
        furnished: true, furnishingCleared: false,
        maxPriceMonthly: 2_400_000, budgetCurrency: "COP", budgetType: "monthly",
      } };
      for (const listener of coagent.listeners) listener();
      probe.restoreSearch({
        neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
        maxPriceMonthly: 2_400_000, budgetCurrency: "COP", stayType: "monthly",
      });
    });
    expect(await send("Actually show unfurnished apartments")).toBe(true);
    const first = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(first.furnished).toBe(false);
    expect(await send("Only under COP 2.3 million")).toBe(true);
    const refined = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(refined).toMatchObject({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2,
      maxPriceMonthly: 2_300_000, furnished: false,
    });
  });

  it("keeps an explicit unfurnished preference through a budget refinement", async () => {
    respond(200, { results: [] });
    expect(await send("Find furnished 2-bedroom apartments in Laureles under COP 3 million")).toBe(true);
    expect(await send("Actually unfurnished apartments")).toBe(true);
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const refined = JSON.parse(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1]?.body));
    expect(refined.neighborhood).toBe("Laureles");
    expect(refined.furnished).toBe(false);
    expect(refined.maxPriceMonthly).toBe(2_500_000);
  });

  it("does not borrow furnishing from older visible metadata for another neighborhood", async () => {
    respond(200, { results: [] });
    Object.assign(coagent.state, { lastIntent: "rental_search", lastRentalQuery: {
      neighborhood: "Envigado", minBedrooms: 2, maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP", budgetType: "monthly",
    } });
    await act(async () => probe.restoreSearch({
      neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, furnished: true,
      maxPriceMonthly: 3_000_000, budgetCurrency: "COP", stayType: "monthly",
    }));
    expect(await send("Only under COP 2.5 million")).toBe(true);
    const next = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(next.neighborhood).toBe("Envigado");
    expect(next.furnished).toBeUndefined();
    expect(next.maxPriceMonthly).toBe(2_500_000);
  });

  it("never reuses stale visible Laureles query text after the signed-in AI moved to Envigado", async () => {
    respond(200, { results: [] });
    const previousText = "Show apartments in Laureles under COP 3 million per month";
    expect(await send(previousText)).toBe(true);
    // The AI can update its rental working memory without updating the older
    // fast-path searchMeta. Keep that newer context instead of stale UI text.
    coagent.state = { lastIntent: "rental_search", lastRentalQuery: {
      neighborhood: "Envigado", maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP", budgetType: "monthly",
    } };
    await act(async () => {
      root.render(
        <EventLocalChatProvider><EventSearchResultsProvider><RentalFastPathProvider>
          <EventFastPathProvider><GroundedFastPathProvider><RestaurantFastPathProvider>
            <Harness />
          </RestaurantFastPathProvider></GroundedFastPathProvider></EventFastPathProvider>
        </RentalFastPathProvider></EventSearchResultsProvider></EventLocalChatProvider>,
      );
    });
    expect(await send("Now only under COP 2.5 million per month")).toBe(true);
    const next = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(next.neighborhood).toBe("Envigado");
    expect(next.maxPriceMonthly).toBe(2_500_000);
    expect(next.budgetCurrency).toBe("COP");
    expect(next.queryText).not.toBe(previousText);
  });

  it("a budget currency switch starts a new semantic search, never reuses COP query text", async () => {
    respond(200, { results: [] });
    expect(await send("Only show apartments under COP 3 million per month")).toBe(true);
    expect(await send("Now only under USD 2000 per month")).toBe(true);
    const next = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(next.budgetCurrency).toBe("USD");
    expect(next.maxPriceMonthly).toBe(2_000);
    expect(next.queryText).not.toBe("Only show apartments under COP 3 million per month");
  });

  it("a new chat cannot reuse the previous guest rental budget", async () => {
    respond(200, { results: [] });
    expect(await send("Only show apartments under COP 3 million per month")).toBe(true);
    await act(async () => { probe.reset(); });
    expect(await send("Now only under COP 2.5 million per month")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a saved-chat switch uses the visible saved budget, not the old guest thread's filters", async () => {
    respond(200, { results: [] });
    expect(await send("Show apartments in Laureles under COP 3 million per month")).toBe(true);
    await act(async () => {
      probe.reset();
      probe.restoreSearch({ neighborhood: "Envigado", maxPriceMonthly: 2_700_000, budgetCurrency: "COP", stayType: "monthly" });
    });
    expect(await send("Now only under COP 2.5 million per month")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const next = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(next.neighborhood).toBe("Envigado");
    expect(next.maxPriceMonthly).toBe(2_500_000);
    expect(next.budgetCurrency).toBe("COP");
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

  it("a display error after HTTP 200 keeps prior real cards, metadata and memory", async () => {
    const previous = {
      id: "previous_card_101", title: "Earlier apartment", neighborhood: "Laureles",
      nightly_price: 55, currency: "USD", bedrooms: 1,
      latitude: 6.2515, longitude: -75.5922,
    };
    const replacement = { ...previous, id: "new_card_202", title: "Replacement apartment" };
    respond(200, { results: [previous] });
    const firstQuestion = "Search apartments Medellín";
    expect(await send(firstQuestion)).toBe(true);
    expect(probe.previousQuery()).toBe(firstQuestion);
    expect(probe.hasListing(previous.id)).toBe(true);

    respond(200, { results: [replacement] });
    map.throwRentalMergeOnce = true;
    expect(await send("Only apartments in Laureles")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(probe.failure()).toEqual({ status: null, code: "result_processing_error", retryable: false });
    expect(probe.previousQuery()).toBe(firstQuestion);
    expect(probe.hasListing(previous.id)).toBe(true);
    expect(probe.hasListing(replacement.id)).toBe(false);
    expect(assistantText()).toMatch(/new rental results could not be displayed/i);
    expect(assistantText()).not.toMatch(/rental search is temporarily unavailable/i);
    expect(unhandled).toEqual([]);
  });

  it("keeps the previous chat exchange when the next rental search fails", async () => {
    respond(200, { results: [{
      id: "prior_rental_001", title: "Sourced Laureles apartment",
      neighborhood: "Laureles", bedrooms: 2,
      nightly_price: 75, currency: "USD", latitude: 6.251, longitude: -75.59,
    }] });
    const initialQuestion = "Search apartments Medellín";
    expect(await send(initialQuestion)).toBe(true);
    expect(probe.messages()).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: initialQuestion }),
    ]));
    expect(probe.hasListing("prior_rental_001")).toBe(true);
    const firstAnswer = probe.messages().find((m) => m.role === "assistant")?.content;
    expect(firstAnswer?.trim().length).toBeGreaterThan(0);

    respond(503, { error: "rental_search_unavailable" });
    expect(await send("Only apartments in Laureles")).toBe(true);
    // The failure should not erase the preceding user question/assistant answer.
    expect(probe.messages()).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: initialQuestion }),
      expect.objectContaining({ role: "assistant", content: firstAnswer }),
      expect.objectContaining({ role: "user", content: "Only apartments in Laureles" }),
    ]));
    expect(probe.messages().filter((m) => m.role === "assistant")).toHaveLength(2);
    expect(probe.hasListing("prior_rental_001")).toBe(true);
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

  it("a furnishing price question while searching does not cancel the current result", async () => {
    const card = { id: "still-valid-rental", title: "Furnished Laureles", neighborhood: "Laureles",
      bedrooms: 2, furnished: true, price_monthly: 2_800_000, currency: "COP",
      latitude: 6.25, longitude: -75.59 };
    const search = await startSlowFirstSearch(
      "Find furnished 2-bedroom apartments in Laureles under COP 3 million", { results: [card] },
    );
    await act(async () => {
      // A non-search question correctly falls through to the concierge.
      expect(await probe.send("Are furnished places more expensive?")).toBe(false);
    });
    await search.finish();
    expect(probe.hasListing("still-valid-rental")).toBe(true);
    expect(assistantText()).not.toMatch(/set aside those results because you changed/i);
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

