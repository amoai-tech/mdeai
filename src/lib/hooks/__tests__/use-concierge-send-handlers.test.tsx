// @vitest-environment jsdom
/**
 * SAN-966 — a typed question must never disappear. When the AI runtime is unreachable there is no
 * agent, `appendMessage` returns false, and the renter used to see nothing: no bubble, no error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const chat = vi.hoisted(() => ({ appendMessage: vi.fn(), runtimeUnavailable: false }));

vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({ appendMessage: chat.appendMessage, isRuntimeUnavailable: () => chat.runtimeUnavailable }),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: undefined, state: {}, setState: () => {} }),
}));
// The fast-path searches are not under test here.
const noMatch = vi.hoisted(() => ({ handleUserMessage: async () => false }));
vi.mock("@/hooks/use-event-search-fast-path", () => ({ useEventSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-event-venue-booking-fast-path", () => ({ useEventVenueBookingFastPath: () => noMatch }));
vi.mock("@/hooks/use-grounded-search-fast-path", () => ({ useGroundedSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-rental-search-fast-path", () => ({ useRentalSearchFastPath: () => noMatch }));
vi.mock("@/hooks/use-restaurant-search-fast-path", () => ({ useRestaurantSearchFastPath: () => noMatch }));

import { EventLocalChatProvider, useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { clearConciergeError, reportConciergeError } from "@/lib/concierge-error-store";
import { AGENT_UNAVAILABLE_MESSAGE, useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";
import type { ConciergeSendHandlers } from "@/lib/concierge-send-user-message";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let handlers: ConciergeSendHandlers;
let shown: Array<{ role: string; content: string }>;

function Harness() {
  const h = useConciergeSendHandlers();
  const { messages } = useEventLocalChat();
  useEffect(() => {
    handlers = h;
    shown = messages;
  });
  return null;
}

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  vi.clearAllMocks();
  chat.runtimeUnavailable = false;
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
      reportConciergeError(); // what the provider's onError does when the run fails
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
