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
const mapState = vi.hoisted(() => ({ selectedPinId: null as string | null, pins: [] as Array<{ id: string; category: string }> }));
const groundedCtx = vi.hoisted(() => ({ toolResult: null as unknown }));
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
  useConciergeCoAgent: () => ({ agent: undefined, state: coagent.state, setState: () => {} }),
}));
// The fast-path searches are not under test here.
const noMatch = vi.hoisted(() => ({ handleUserMessage: async () => false }));
const eventFast = vi.hoisted(() => ({ handleUserMessage: async () => false, activeEventId: null as string | null }));
vi.mock("@/hooks/use-event-search-fast-path", () => ({ useEventSearchFastPath: () => eventFast }));
vi.mock("@/hooks/use-event-venue-booking-fast-path", () => ({ useEventVenueBookingFastPath: () => noMatch }));
const groundedNearby = vi.hoisted(() => ({ handleUserMessage: vi.fn(async () => true) }));
vi.mock("@/hooks/use-grounded-search-fast-path", () => ({ useGroundedSearchFastPath: () => groundedNearby }));
vi.mock("@/platform/maps/map-context", () => ({ useOptionalMapContext: () => mapState }));
vi.mock("@/components/chat/grounded-fast-path-context", () => ({ useGroundedFastPath: () => groundedCtx }));
vi.mock("@/hooks/use-rental-search-fast-path", () => ({ useRentalSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-restaurant-search-fast-path", () => ({ useRestaurantSearchFastPath: () => noMatch }));

import { EventLocalChatProvider, useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { SIGN_IN_REQUIRED_MESSAGE } from "@/lib/concierge-sign-in-message";
import { clearConciergeError, getConciergeErrorForThread, reportConciergeError } from "@/lib/concierge-error-store";
import { AGENT_UNAVAILABLE_MESSAGE, useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";
import { sendConciergeUserMessage, type ConciergeSendHandlers } from "@/lib/concierge-send-user-message";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let handlers: ConciergeSendHandlers;
let shown: Array<{ role: string; content: string }>;
let promptShown = false;

function Harness() {
  const h = useConciergeSendHandlers();
  const { messages, signInPrompt } = useEventLocalChat();
  useEffect(() => {
    handlers = h;
    shown = messages;
    promptShown = signInPrompt;
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
  eventFast.activeEventId = null;
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
        <Harness />
      </EventLocalChatProvider>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
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
        <EventLocalChatProvider>
          <Harness />
        </EventLocalChatProvider>,
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
  const rerender = () => act(() => root.render(<EventLocalChatProvider><Harness /></EventLocalChatProvider>));

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
  const rerender = () => act(() => root.render(<EventLocalChatProvider><Harness /></EventLocalChatProvider>));

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
    mapState.selectedPinId = null;
    mapState.pins = [];
    rerender();
    await act(async () => { expect(await handlers.handleGroundedMessage("Which café is closest?")).toBe(true); });
    expect(groundedNearby.handleUserMessage).toHaveBeenCalled();
    expect(shown.some((m) => /típica tiendas is the closest/i.test(m.content))).toBe(false);
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
        <EventLocalChatProvider>
          <Harness />
        </EventLocalChatProvider>,
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

  it("dispatches exactly one Quick view recovery only for a card request with an authorized event", async () => {
    eventFast.activeEventId = "a1b2c3d4-0001-0001-0001-000000000003";
    act(() => root.render(<EventLocalChatProvider><Harness /></EventLocalChatProvider>));
    chat.appendMessage.mockResolvedValue(true);
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener("mde:event-card-recovery", listener);
    await act(async () => {
      await handlers.onAgentSend("Show the first event as a card.");
    });
    window.removeEventListener("mde:event-card-recovery", listener);
    expect(seen).toEqual([{ eventId: "a1b2c3d4-0001-0001-0001-000000000003" }]);
  });

  it("does not dispatch recovery without an authorized event ID", async () => {
    chat.appendMessage.mockResolvedValue(true);
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener("mde:event-card-recovery", listener);
    await act(async () => {
      await handlers.onAgentSend("Show the first event as a card.");
    });
    window.removeEventListener("mde:event-card-recovery", listener);
    expect(seen).toEqual([]);
  });

});
