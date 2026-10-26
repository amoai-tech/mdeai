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
vi.mock("@/lib/chat/thread-nav-context", () => ({
  useOptionalThreadNav: () => ({ activeThreadId: "thread-b", sessionThreadId: "thread-b" }),
}));
const session = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, loading: false }));
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
vi.mock("@/hooks/use-event-search-fast-path", () => ({ useEventSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-event-venue-booking-fast-path", () => ({ useEventVenueBookingFastPath: () => noMatch }));
vi.mock("@/hooks/use-grounded-search-fast-path", () => ({ useGroundedSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-rental-search-fast-path", () => ({ useRentalSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-restaurant-search-fast-path", () => ({ useRestaurantSearchFastPath: () => noMatch }));

import { EventLocalChatProvider, useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { SIGN_IN_REQUIRED_MESSAGE } from "@/lib/concierge-sign-in-message";
import { clearConciergeError, reportConciergeError } from "@/lib/concierge-error-store";
import { AGENT_UNAVAILABLE_MESSAGE, useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";
import type { ConciergeSendHandlers } from "@/lib/concierge-send-user-message";

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
  session.user = { id: "u1" };
  session.loading = false;
  supa.getUser.mockReset();
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
});
