// @vitest-environment jsdom
/**
 * SAN-966 — a typed question must never disappear. When the AI runtime is unreachable there is no
 * agent, `appendMessage` returns false, and the renter used to see nothing: no bubble, no error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const chat = vi.hoisted(() => ({ appendMessage: vi.fn(), runtimeUnavailable: false, waitForRuntimeReady: vi.fn() }));
const coagent = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
const mapState = vi.hoisted(() => ({ selectedPinId: null as string | null, pins: [] as Array<{ id: string; category: string }>, mergePinsByCategory: vi.fn() }));
const groundedCtx = vi.hoisted(() => ({ toolResult: null as unknown }));
const rentalDetails = vi.hoisted(() => ({ toolResult: null as unknown, openVenueDetail: vi.fn(), closeRentalDetails: vi.fn() }));
// Reuse the real rental context (including searchMeta updates); override only
// the shown Details cards for the unrelated deterministic Details tests.
vi.mock("@/components/chat/rental-fast-path-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/chat/rental-fast-path-context")>();
  return {
    ...actual,
    useOptionalRentalFastPath: () => {
      const current = actual.useOptionalRentalFastPath();
      return current ? { ...current, toolResult: rentalDetails.toolResult ?? current.toolResult } : null;
    },
  };
});
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({ openVenueDetail: rentalDetails.openVenueDetail, closeRentalDetails: rentalDetails.closeRentalDetails }),
}));
const richShown = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/components/chat/rich-card-results-context", () => ({
  useOptionalRichCardResults: () => ({ groundedShownIds: richShown.ids }),
}));

vi.mock("@/lib/chat/thread-nav-context", () => ({
  useOptionalThreadNav: () => ({ activeThreadId: "thread-b", sessionThreadId: "thread-b" }),
}));
const session = vi.hoisted(() => ({ user: { id: "u1" } as { id: string; is_anonymous?: boolean } | null, loading: false }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => session }));
const supa = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: supa.getUser } }) }));

vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({ appendMessage: chat.appendMessage, isRuntimeUnavailable: () => chat.runtimeUnavailable, waitForRuntimeReady: chat.waitForRuntimeReady }),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({
    agent: undefined, state: coagent.state,
    setState: (patch: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => {
      coagent.state = typeof patch === "function" ? patch(coagent.state) : { ...coagent.state, ...patch };
    },
  }),
}));
// The fast-path searches are not under test here.
const noMatch = vi.hoisted(() => ({ handleUserMessage: async () => false }));
const eventFast = vi.hoisted(() => ({
  handleUserMessage: async () => false,
  activeEventId: null as string | null,
  activeEventRows: [] as Array<{ id: string; title: string }>,
}));
vi.mock("@/hooks/use-event-search-fast-path", () => ({ useEventSearchFastPath: () => eventFast }));
vi.mock("@/hooks/use-event-venue-booking-fast-path", () => ({ useEventVenueBookingFastPath: () => noMatch }));
const groundedNearby = vi.hoisted(() => ({ handleUserMessage: vi.fn(async () => true) }));
vi.mock("@/hooks/use-grounded-search-fast-path", () => ({ useGroundedSearchFastPath: () => groundedNearby }));
vi.mock("@/platform/maps/map-context", () => ({ useOptionalMapContext: () => mapState }));
vi.mock("@/components/chat/grounded-fast-path-context", () => ({ useGroundedFastPath: () => groundedCtx }));
vi.mock("@/hooks/use-rental-search-fast-path", () => ({ useRentalSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-restaurant-search-fast-path", () => ({ useRestaurantSearchFastPath: () => noMatch }));

import { EventLocalChatProvider, useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { RentalFastPathProvider, useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { SIGN_IN_REQUIRED_MESSAGE } from "@/lib/concierge-sign-in-message";
import { clearConciergeError, getConciergeErrorForThread, reportConciergeError } from "@/lib/concierge-error-store";
import { AGENT_UNAVAILABLE_MESSAGE, useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";
import { sendConciergeUserMessage, type ConciergeSendHandlers } from "@/lib/concierge-send-user-message";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let handlers: ConciergeSendHandlers;
let shown: Array<{ role: string; content: string }>;
let promptShown = false;
let restoreRentalSearch: ReturnType<typeof useRentalFastPath>["setSearchMeta"];

function Harness() {
  const h = useConciergeSendHandlers();
  const { messages, signInPrompt } = useEventLocalChat();
  const { setSearchMeta } = useRentalFastPath();
  useEffect(() => {
    handlers = h;
    shown = messages;
    promptShown = signInPrompt;
    restoreRentalSearch = setSearchMeta;
  });
  return null;
}

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  vi.clearAllMocks();
  chat.runtimeUnavailable = false;
  chat.waitForRuntimeReady.mockImplementation(async () => !chat.runtimeUnavailable);
  coagent.state = {};
  mapState.selectedPinId = null;
  mapState.pins = [];
  groundedCtx.toolResult = null;
  rentalDetails.toolResult = null;
  richShown.ids = [];
  eventFast.activeEventId = null;
  eventFast.activeEventRows = [];
  session.user = { id: "u1" };
  session.loading = false;
  supa.getUser.mockReset();
  groundedNearby.handleUserMessage.mockResolvedValue(true);
  window.sessionStorage.clear();
  clearConciergeError();
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <EventLocalChatProvider>
        <RentalFastPathProvider><Harness /></RentalFastPathProvider>
      </EventLocalChatProvider>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("guest context from visible rental search", () => {
  it("recognizes visible rental search criteria even without authenticated CoAgent state", async () => {
    coagent.state = {};
    session.user = null;
    await act(async () => {
      restoreRentalSearch({ userText: "Only apartments under COP 3M", params: {
        maxPriceMonthly: 3_000_000, budgetCurrency: "COP", stayType: "monthly",
      } });
    });
    expect(handlers.inRentalSearch).toBe(true);
    await act(async () => { restoreRentalSearch(null); });
    expect(handlers.inRentalSearch).toBe(false);
  });
});

describe("SAN-874 latest-topic context", () => {
  it("keeps a guest's apartment cards when coworking requires sign-in", async () => {
    session.user = null;
    await act(async () => {
      restoreRentalSearch({ userText: "Apartments under COP 3M", params: {
        maxPriceMonthly: 3_000_000, budgetCurrency: "COP", stayType: "monthly",
      } });
    });
    expect(handlers.inRentalSearch).toBe(true);
    await act(async () => {
      await sendConciergeUserMessage("What coworking spaces are in Laureles?", handlers);
    });
    expect(handlers.inRentalSearch).toBe(true);
    expect(coagent.state.lastIntent).toBeUndefined();
  });

  it("clears stale rental criteria after coworking even if Mastra has not updated lastIntent", async () => {
    await act(async () => {
      restoreRentalSearch({ userText: "Apartments under COP 3M", params: {
        maxPriceMonthly: 3_000_000, budgetCurrency: "COP", stayType: "monthly",
      } });
    });
    expect(handlers.inRentalSearch).toBe(true);
    const agent = vi.fn(async (_text: string, _id?: string, onAccepted?: () => void, onCompleted?: () => void) => {
      onAccepted?.();
      onCompleted?.();
      return true;
    });
    await act(async () => {
      await sendConciergeUserMessage("What coworking spaces are in Laureles?", {
        ...handlers, onAgentSend: agent,
      });
    });
    expect(agent).toHaveBeenCalledOnce();
    expect(coagent.state.lastIntent).toBe("general_concierge");
    expect(coagent.state.lastRentalQuery).toBeUndefined();
    expect(mapState.mergePinsByCategory).toHaveBeenCalledWith("rental", []);
    expect(handlers.inRentalSearch).toBe(false);
    const rental = vi.fn(async () => true);
    await act(async () => {
      await sendConciergeUserMessage("Only under COP 800k per month", {
        ...handlers, handleRentalMessage: rental, onAgentSend: agent,
      });
    });
    expect(rental).not.toHaveBeenCalled();
  });
});

describe("signed-in intent changes after rental discovery", () => {
  it.each([
    ["coworking", "general_concierge"],
    ["events", "event_discovery"],
    ["restaurants", "restaurant_discovery"],
  ])("does not revive rental cards after switching to %s", async (_topic, latestIntent) => {
    // Old rental search cards can remain displayed while a signed-in AI turn
    // changes the latest intent to general concierge/coworking.
    await act(async () => {
      restoreRentalSearch({ userText: "Show apartments under COP 3 million", params: {
        neighborhood: "Laureles", maxPriceMonthly: 3_000_000,
        budgetCurrency: "COP", stayType: "monthly",
      } });
    });
    coagent.state = { lastIntent: latestIntent, lastRentalQuery: {
      neighborhood: "Laureles", maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP", budgetType: "monthly",
    } };
    await act(async () => {
      root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>);
    });
    expect(handlers.inRentalSearch).toBe(false);
    for (const message of ["only under COP 800k per month", "anywhere is fine"]) {
      const rental = vi.fn(async () => true);
      const agent = vi.fn(async () => true);
      expect(await sendConciergeUserMessage(message, {
        ...handlers, handleRentalMessage: rental, onAgentSend: agent,
      })).toBe(true);
      expect(rental).not.toHaveBeenCalled();
      expect(agent).toHaveBeenCalledTimes(1);
    }
  });

  it("preserves the current signed-in rental refinement when the latest intent is rental", async () => {
    await act(async () => {
      restoreRentalSearch({ userText: "Apartments under COP 3 million", params: {
        maxPriceMonthly: 3_000_000, budgetCurrency: "COP", stayType: "monthly",
      } });
    });
    coagent.state = { lastIntent: "rental_search" };
    await act(async () => {
      root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>);
    });
    expect(handlers.inRentalSearch).toBe(true);
  });
});

describe("onAgentSend never leaves the renter with nothing", () => {
  it("shows the question and an unavailable notice when there is no agent", async () => {
    chat.appendMessage.mockResolvedValue(false);
    let handled: boolean | undefined;
    await act(async () => {
      handled = await handlers.onAgentSend("what is the capital of Colombia?");
    });
    expect(handled).toBe(true);
    expect(shown.map((m) => [m.role, m.content])).toEqual([
      ["user", "what is the capital of Colombia?"],
      ["assistant", AGENT_UNAVAILABLE_MESSAGE],
    ]);
  });

  it("waits for the signed-in runtime's initial connection before sending exactly once", async () => {
    chat.runtimeUnavailable = true;
    chat.waitForRuntimeReady.mockImplementation(async () => {
      chat.runtimeUnavailable = false;
      return true;
    });
    chat.appendMessage.mockResolvedValue(true);
    await act(async () => {
      await handlers.onAgentSend("Remember my preference for Laureles");
    });
    expect(chat.waitForRuntimeReady).toHaveBeenCalledTimes(1);
    expect(chat.appendMessage).toHaveBeenCalledTimes(1);
    expect(chat.appendMessage).toHaveBeenCalledWith("Remember my preference for Laureles");
    expect(shown).toEqual([]);
  });

  it("shows a visible retryable unavailable message after the bounded runtime wait fails", async () => {
    chat.waitForRuntimeReady.mockResolvedValue(false);
    await act(async () => {
      await handlers.onAgentSend("Request a table at Verdeo at 7 PM");
    });
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(shown.map((m) => [m.role, m.content])).toEqual([
      ["user", "Request a table at Verdeo at 7 PM"],
      ["assistant", AGENT_UNAVAILABLE_MESSAGE],
    ]);
    // A later deliberate retry is accepted once runtime recovers; no hidden replay.
    chat.waitForRuntimeReady.mockResolvedValue(true);
    chat.appendMessage.mockResolvedValue(true);
    await act(async () => {
      await handlers.onAgentSend("Request a table at Verdeo at 7 PM");
    });
    expect(chat.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not run the same accepted chat send twice while waiting for connection", async () => {
    let connect!: (ready: boolean) => void;
    chat.waitForRuntimeReady.mockReturnValue(new Promise<boolean>((resolve) => {
      connect = resolve;
    }));
    chat.appendMessage.mockResolvedValue(true);
    const first = handlers.onAgentSend("Remember Laureles");
    const duplicate = handlers.onAgentSend("Remember Laureles");
    await Promise.resolve();
    expect(chat.waitForRuntimeReady).toHaveBeenCalledTimes(1);
    connect(true);
    await act(async () => {
      await Promise.all([first, duplicate]);
    });
    expect(chat.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps two distinct queued questions in order instead of dropping one", async () => {
    let finishFirst!: (value: boolean) => void;
    chat.appendMessage
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
        finishFirst = resolve;
      }))
      .mockResolvedValue(true);
    const first = handlers.onAgentSend("first question");
    const second = handlers.onAgentSend("second question");
    await vi.waitFor(() => expect(chat.appendMessage).toHaveBeenCalledTimes(1));
    expect(chat.appendMessage).toHaveBeenNthCalledWith(1, "first question");
    finishFirst(true);
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(chat.appendMessage).toHaveBeenCalledTimes(2);
    expect(chat.appendMessage).toHaveBeenNthCalledWith(2, "second question");
  });

  it("does not even try the agent when CopilotKit says the runtime is unreachable", async () => {
    chat.runtimeUnavailable = true;
    let handled: boolean | undefined;
    await act(async () => {
      handled = await handlers.onAgentSend("tell me about Laureles");
    });
    expect(handled).toBe(true);
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(shown.map((m) => [m.role, m.content])).toEqual([
      ["user", "tell me about Laureles"],
      ["assistant", AGENT_UNAVAILABLE_MESSAGE],
    ]);
  });

  it("adds only the notice when CopilotKit swallows the run failure and reports it", async () => {
    chat.appendMessage.mockImplementation(async () => {
      reportConciergeError("thread-b"); // provider's onError reports the current thread
      return true;
    });
    await act(async () => {
      await handlers.onAgentSend("tell me about Laureles");
    });
    expect(shown.map((m) => m.role)).toEqual(["assistant"]);
    expect(shown[0].content).toBe(AGENT_UNAVAILABLE_MESSAGE);
  });

  it("adds only the notice when the run itself fails (the question is already in the transcript)", async () => {
    chat.appendMessage.mockRejectedValue(new Error("Failed to fetch"));
    let handled: boolean | undefined;
    await act(async () => {
      handled = await handlers.onAgentSend("tell me about El Poblado");
    });
    expect(handled).toBe(true);
    expect(shown.map((m) => m.role)).toEqual(["assistant"]);
    expect(shown[0].content).toBe(AGENT_UNAVAILABLE_MESSAGE);
  });

  it("does not report a different conversation's late failure as this agent's failure", async () => {
    chat.appendMessage.mockImplementation(async () => {
      reportConciergeError("thread-a");
      return true;
    });
    await act(async () => {
      await handlers.onAgentSend("hello from thread B");
    });
    expect(shown).toEqual([]);
  });

  it("adds nothing when the agent takes the message", async () => {
    chat.appendMessage.mockResolvedValue(true);
    let handled: boolean | undefined;
    await act(async () => {
      handled = await handlers.onAgentSend("hello");
    });
    expect(handled).toBe(true);
    expect(shown).toEqual([]);
  });
});

describe("SAN-407 · INT-004 — is the conversation in a rental search?", () => {
  const rerender = () =>
    act(() =>
      root.render(
        <EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>,
      ),
    );

  it.each([
    ["a current rental search", { lastIntent: "rental_search", lastRentalQuery: { neighborhood: "Laureles" } }, true],
    ["a saved older conversation (rental_refine)", { lastIntent: "rental_refine", lastRentalQuery: { minBedrooms: 2 } }, true],
    ["a saved query with no intent recorded yet", { lastRentalQuery: { minBedrooms: 2 } }, true],
    ["an events search after a rental search", { lastIntent: "event_discovery", lastRentalQuery: { neighborhood: "Laureles" } }, false],
    ["a rental intent with no saved query", { lastIntent: "rental_search" }, false],
    ["a brand-new conversation", {}, false],
  ])("%s -> %s", (_label, state, expected) => {
    coagent.state = state;
    rerender();
    expect(handlers.inRentalSearch).toBe(expected);
  });
});

// SAN-1507 — a signed-out visitor's AI question got "The assistant can't answer right now. Please try
// again", although the runtime refuses guests on purpose and a retry can never work.
describe("SAN-106 guest Nearby chat routing", () => {
  const text = "Show cafés within 800 meters of this apartment";
  const rerender = () => act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));

  it("offers sign-in rather than sending a selected-rental Nearby request or retrying 401", async () => {
    session.user = null;
    rerender();
    let handled: boolean | undefined;
    await act(async () => { handled = await sendConciergeUserMessage(text, handlers); });
    expect(handled).toBe(true);
    expect(groundedNearby.handleUserMessage).not.toHaveBeenCalled();
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(promptShown).toBe(true);
    expect(getConciergeErrorForThread("thread-b").version).toBe(0);
    expect(shown.map((m) => ({ role: m.role, content: m.content }))).toEqual([{ role: "user", content: text }]);
  });

  it("shows sign-in during an unresolved session without a billable Nearby request", async () => {
    session.user = null;
    session.loading = true;
    supa.getUser.mockResolvedValue({ data: { user: null } });
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage(text, handlers)).toBe(true); });
    expect(groundedNearby.handleUserMessage).not.toHaveBeenCalled();
    expect(supa.getUser).toHaveBeenCalledOnce();
    expect(promptShown).toBe(true);
  });

  it("rejects anonymous Supabase identities while keeping a visible sign-in prompt", async () => {
    session.user = { id: "temporary-user", is_anonymous: true };
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage(text, handlers)).toBe(true); });
    expect(groundedNearby.handleUserMessage).not.toHaveBeenCalled();
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(promptShown).toBe(true);
  });

  it("keeps contextual Nearby on the grounded fast path for signed-in users", async () => {
    await act(async () => { expect(await sendConciergeUserMessage(text, handlers)).toBe(true); });
    expect(groundedNearby.handleUserMessage).toHaveBeenCalledWith(text, expect.any(String));
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(promptShown).toBe(false);
  });

  it("keeps general café search public for signed-out users", async () => {
    session.user = null;
    rerender();
    const general = "best cafes in Laureles";
    await act(async () => { expect(await handlers.handleGroundedMessage(general)).toBe(true); });
    expect(groundedNearby.handleUserMessage).toHaveBeenCalledWith(general, undefined);
    expect(promptShown).toBe(false);
  });
});

describe("deterministic grounded ranking is limited to the shown result set and current anchor", () => {
  const A = "37a05b09-f560-4776-92fd-b8bb2b92e611";
  const B = "e404023e-ad2f-4446-896d-e085ecdacaf1";
  const rows = [{ id: "cafe-a", title: "típica tiendas", distanceMeters: 36, distanceFromRentalId: A }];
  const rerender = () => act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));

  it("falls through when the map selection is a different apartment", async () => {
    coagent.state = { selectedListingId: A, lastGroundedResults: rows, lastIntent: "restaurant_discovery" };
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "cafe-a" }] };
    mapState.selectedPinId = `rental-${B}`;
    mapState.pins = [{ id: `rental-${B}`, category: "rental" }];
    rerender();
    await act(async () => { expect(await handlers.handleGroundedMessage("Which café is closest?")).toBe(true); });
    expect(groundedNearby.handleUserMessage).toHaveBeenCalled();
    expect(shown.some((m) => /típica tiendas is the closest/i.test(m.content))).toBe(false);
  });

  it("falls through when a restaurant search cleared the grounded panel", async () => {
    coagent.state = { selectedListingId: A, lastGroundedResults: rows };
    groundedCtx.toolResult = null;
  rentalDetails.toolResult = null;
    mapState.selectedPinId = null;
    mapState.pins = [];
    rerender();
    await act(async () => { expect(await handlers.handleGroundedMessage("Which café is closest?")).toBe(true); });
    expect(groundedNearby.handleUserMessage).toHaveBeenCalled();
    expect(shown.some((m) => /típica tiendas is the closest/i.test(m.content))).toBe(false);
  });

  it("answers unknown for Wi-Fi instead of inferring amenities", async () => {
    coagent.state = {
      selectedListingId: A,
      lastGroundedResults: [{ id: "cafe-a", title: "Café Euge", distanceMeters: 36, distanceFromRentalId: A }],
    };
    mapState.selectedPinId = null;
    mapState.pins = [];
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "cafe-a" }] };
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage("Which café has reliable Wi-Fi?", handlers)).toBe(true); });
    expect(groundedNearby.handleUserMessage).not.toHaveBeenCalled();
    expect(shown.some((m) => m.role === "assistant" && /don't have verified amenity/i.test(m.content))).toBe(true);
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(shown.some((m) => m.role === "assistant" && /reliable Wi-Fi|has Wi-Fi/i.test(m.content))).toBe(false);
  });

  it("does not answer from co-agent rows when no grounded cards are shown", async () => {
    coagent.state = { lastGroundedResults: [{ id: "cafe-a", title: "Old Café" }] };
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "restaurant-new" }] };
    chat.appendMessage.mockResolvedValue(true);
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage("Which café has Wi-Fi?", handlers)).toBe(true); });
    expect(shown.some((m) => /don't have verified amenity/i.test(m.content))).toBe(false);
    expect(chat.appendMessage).toHaveBeenCalledOnce();
  });

  it("recognizes the current Mastra-rendered IDs without a fast-path tool result", async () => {
    coagent.state = { lastGroundedResults: [{ id: "cafe-a", title: "Café Euge" }] };
    richShown.ids = ["cafe-a"];
    groundedCtx.toolResult = null;
  rentalDetails.toolResult = null;
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage("Which of these has Wi-Fi?", handlers)).toBe(true); });
    expect(shown.some((m) => /don't have verified amenity/i.test(m.content))).toBe(true);
    expect(chat.appendMessage).not.toHaveBeenCalled();
  });

  it("does not hijack apartment Wi-Fi questions while cafés are still in memory", async () => {
    coagent.state = { lastGroundedResults: [{ id: "cafe-a", title: "Café Euge" }] };
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "cafe-a" }] };
    chat.appendMessage.mockResolvedValue(true);
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage("Does the apartment have Wi-Fi?", handlers)).toBe(true); });
    expect(shown.some((m) => /don't have verified amenity/i.test(m.content))).toBe(false);
    expect(await handlers.handleGroundedAmenityFollowUp?.("Does the apartment have Wi-Fi?")).toBe(false);
  });

  it("protects a Spanish current-café Wi-Fi question before the agent", async () => {
    coagent.state = { lastGroundedResults: [{ id: "cafe-a", title: "Café Euge" }] };
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "cafe-a" }] };
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage("¿Cuál tiene buen Wi-Fi?", handlers)).toBe(true); });
    expect(shown.some((m) => /don't have verified amenity/i.test(m.content))).toBe(true);
    expect(chat.appendMessage).not.toHaveBeenCalled();
  });

  it("does not block a brand-new cafe Wi-Fi discovery query", async () => {
    coagent.state = { lastGroundedResults: [{ id: "cafe-a", title: "Café Euge" }] };
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "cafe-a" }] };
    rerender();
    const question = "Are there cafés with Wi-Fi in Laureles?";
    await act(async () => { expect(await sendConciergeUserMessage(question, handlers)).toBe(true); });
    expect(shown.some((m) => /don't have verified amenity/i.test(m.content))).toBe(false);
    expect(groundedNearby.handleUserMessage).toHaveBeenCalled();
  });

  it("preserves real Wi-Fi facts rather than returning the unknown response", async () => {
    coagent.state = { lastGroundedResults: [{ id: "cafe-a", title: "Café Euge", wifi: false }] };
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "cafe-a" }] };
    chat.appendMessage.mockResolvedValue(true);
    rerender();
    await act(async () => { expect(await sendConciergeUserMessage("Which café has Wi-Fi?", handlers)).toBe(true); });
    expect(shown.some((m) => /don't have verified amenity/i.test(m.content))).toBe(false);
    expect(chat.appendMessage).toHaveBeenCalledOnce();
  });

  it("answers deterministically when the shown rows belong to the current map anchor", async () => {
    coagent.state = { selectedListingId: A, lastGroundedResults: rows };
    groundedCtx.toolResult = { source: "grounding", results: [{ id: "cafe-a" }] };
    mapState.selectedPinId = `rental-${A}`;
    mapState.pins = [{ id: `rental-${A}`, category: "rental" }];
    rerender();
    await act(async () => { expect(await handlers.handleGroundedMessage("Which café is closest?")).toBe(true); });
    expect(groundedNearby.handleUserMessage).not.toHaveBeenCalled();
    expect(shown.some((m) => /típica tiendas is the closest, about 36 m/i.test(m.content))).toBe(true);
  });
});

describe("onAgentSend for a signed-out visitor", () => {
  const rerender = () =>
    act(() =>
      root.render(
        <EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>,
      ),
    );

  it("keeps the question visible and asks them to sign in, without calling the agent", async () => {
    session.user = null;
    rerender();
    let handled: boolean | undefined;
    await act(async () => {
      handled = await handlers.onAgentSend("What is a good day trip from Medellín?");
    });
    expect(handled).toBe(true);
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(shown.map((m) => [m.role, m.content])).toEqual([
      ["user", "What is a good day trip from Medellín?"],
    ]);
    expect(promptShown).toBe(true);
    expect(SIGN_IN_REQUIRED_MESSAGE).not.toMatch(/try again/i);
  });

  it("does not tell a signed-in visitor to sign in", async () => {
    chat.appendMessage.mockResolvedValue(true);
    await act(async () => {
      await handlers.onAgentSend("tell me about Laureles");
    });
    expect(chat.appendMessage).toHaveBeenCalled();
    expect(promptShown).toBe(false);
  });

  it("keeps the question for the trip to /login", async () => {
    session.user = null;
    rerender();
    await act(async () => {
      await handlers.onAgentSend("What is a good day trip?");
    });
    expect(JSON.parse(window.sessionStorage.getItem("mde.concierge.draft") ?? "{}").text).toBe("What is a good day trip?");
  });

  // A fast guest can send before the session check has finished.
  describe("while the session check is still running", () => {
    beforeEach(() => {
      session.user = null;
      session.loading = true;
      rerender();
    });

    it("asks once and shows sign-in when there is no account, without reaching the agent", async () => {
      supa.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
      await act(async () => {
        await handlers.onAgentSend("tell me about Laureles");
      });
      expect(chat.appendMessage).not.toHaveBeenCalled();
      expect(promptShown).toBe(true);
    });

    it("goes to the agent when the answer is a signed-in user", async () => {
      supa.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      chat.appendMessage.mockResolvedValue(true);
      await act(async () => {
        await handlers.onAgentSend("tell me about Laureles");
      });
      expect(chat.appendMessage).toHaveBeenCalled();
      expect(promptShown).toBe(false);
    });

    it("keeps the sign-in offer when the check itself fails (network down), rather than guessing an account", async () => {
      supa.getUser.mockRejectedValue(new Error("Failed to fetch"));
      await act(async () => {
        await handlers.onAgentSend("tell me about Laureles");
      });
      expect(chat.appendMessage).not.toHaveBeenCalled();
      expect(promptShown).toBe(true);
    });
  });

  it("confirms only after the exact Quick view opens", async () => {
    eventFast.activeEventId = "a1b2c3d4-0001-0001-0001-000000000003";
    eventFast.activeEventRows = [{ id: eventFast.activeEventId, title: "Feria de las Flores" }];
    act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));
    const onRecovery = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId?: string }>).detail;
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery-result", {
        detail: { requestId: detail?.requestId, opened: true },
      }));
    };
    window.addEventListener("mde:event-card-recovery", onRecovery);
    await act(async () => {
      await handlers.onAgentSend("Show the first event as a card.");
    });
    window.removeEventListener("mde:event-card-recovery", onRecovery);
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(shown).toContainEqual(expect.objectContaining({ role: "assistant", content: "Here is the event card." }));
  });

  it("falls through to the model when the card does not open", async () => {
    eventFast.activeEventId = "a1b2c3d4-0001-0001-0001-000000000003";
    eventFast.activeEventRows = [{ id: eventFast.activeEventId, title: "Feria de las Flores" }];
    act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));
    chat.appendMessage.mockResolvedValue(true);
    const onRecovery = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId?: string }>).detail;
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery-result", {
        detail: { requestId: detail?.requestId, opened: false },
      }));
    };
    window.addEventListener("mde:event-card-recovery", onRecovery);
    await act(async () => {
      await handlers.onAgentSend("Show the first event as a card.");
    });
    window.removeEventListener("mde:event-card-recovery", onRecovery);
    expect(chat.appendMessage).toHaveBeenCalledTimes(1);
    expect(shown.some((message) => message.content === "Here is the event card.")).toBe(false);
  });

});


describe("full chat Details requests use the currently shown rental IDs", () => {
  const rental = (id: string, title: string) => ({
    id, title, neighborhood: "Laureles", nightly_price: 0, currency: "COP",
    bedrooms: 2, wifi: false, amenities: ["workspace"],
    image: "https://example.test/a.webp", images: ["https://example.test/a.webp"],
    photo_count: 1, tags: ["external-source"],
    source_url: "https://example.test/listing", can_schedule_viewing: false,
    schedule_viewing_url: null, host_name: "Advertiser",
    availability: "Availability unconfirmed", price_monthly: 2_400_000,
  });

  it("opens the second displayed apartment without a new search or model run", async () => {
    const first = rental("first-listing", "Laureles apartment A");
    const second = rental("second-listing", "Laureles apartment B");
    rentalDetails.toolResult = { results: [first, second] };
    act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));
    await act(async () => {
      expect(await sendConciergeUserMessage("Show me the details of the second apartment", handlers)).toBe(true);
    });
    expect(rentalDetails.openVenueDetail).toHaveBeenCalledTimes(1);
    expect(rentalDetails.openVenueDetail).toHaveBeenCalledWith(expect.objectContaining({
      kind: "rental", listingId: "second-listing", title: "Laureles apartment B",
    }));
    expect(chat.appendMessage).not.toHaveBeenCalled();
    expect(shown.some((m) => m.content.includes("Opened details for Laureles apartment B"))).toBe(true);
  });

  it.each([
    "Show me the details of the second restaurant",
    "Show me the details of the second event",
    "Show me the details of the second hotel",
  ])("leaves other categories for their own handlers even with rental cards visible: %s", async (text) => {
    rentalDetails.toolResult = { results: [
      rental("first-listing", "Laureles apartment A"),
      rental("second-listing", "Laureles apartment B"),
    ] };
    act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));
    expect(await handlers.handleRentalDetailsMessage?.(text)).toBe(false);
    expect(rentalDetails.openVenueDetail).not.toHaveBeenCalled();
  });

  it.each([
    "Show me the details of the second restaurant",
    "Find salsa events this weekend",
  ])("closes prior rental Details on a real new-category send: %s", async (text) => {
    rentalDetails.toolResult = { results: [
      rental("first-listing", "Laureles apartment A"),
      rental("second-listing", "Laureles apartment B"),
    ] };
    act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));
    await act(async () => {
      await sendConciergeUserMessage("Show me the details of the second apartment", handlers);
      expect(rentalDetails.openVenueDetail).toHaveBeenCalledOnce();
      await sendConciergeUserMessage(text, handlers);
    });
    expect(rentalDetails.closeRentalDetails).toHaveBeenCalledOnce();
    expect(rentalDetails.openVenueDetail).toHaveBeenCalledOnce();
  });

  it("refuses an out-of-range position without opening a different apartment", async () => {
    rentalDetails.toolResult = { results: [rental("first-listing", "Laureles apartment A")] };
    act(() => root.render(<EventLocalChatProvider><RentalFastPathProvider><Harness /></RentalFastPathProvider></EventLocalChatProvider>));
    await act(async () => {
      expect(await handlers.handleRentalDetailsMessage?.("Show me the details of the third apartment")).toBe(true);
    });
    expect(rentalDetails.openVenueDetail).not.toHaveBeenCalled();
    expect(shown.some((m) => m.content.includes("No apartment 3"))).toBe(true);
  });

  it("does not resurrect a stale listing when search results were cleared", async () => {
    rentalDetails.toolResult = null;
    expect(await handlers.handleRentalDetailsMessage?.("Show me the details of the second apartment")).toBe(false);
    expect(rentalDetails.openVenueDetail).not.toHaveBeenCalled();
  });
});
