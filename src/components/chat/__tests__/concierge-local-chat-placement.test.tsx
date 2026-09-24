// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const mocks = vi.hoisted(() => {
  const addMessages = vi.fn();
  return {
    addMessages,
    agent: { addMessages } as { addMessages: typeof addMessages } | undefined,
    sendConciergeUserMessage: vi.fn(() => Promise.resolve(true)),
  };
});

const copilotChatView = vi.hoisted(() =>
  vi.fn(({ messages = [], welcomeScreen }: { messages?: Array<{ id: string; role: string; content: string }>; welcomeScreen?: unknown }) =>
    React.createElement(
      "div",
      {
        "data-testid": "copilot-chat-view-mounted",
        "data-welcome-screen": welcomeScreen === false ? "false" : "provided",
      },
      messages.map((message) =>
        React.createElement("div", { key: message.id, "data-role": message.role }, message.content),
      ),
    ),
  ),
);
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatView: copilotChatView,
}));

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({
    agent: mocks.agent,
  }),
}));

vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({
  useConciergeSendHandlers: () => ({
    handleRentalMessage: vi.fn(),
    handleEventMessage: vi.fn(),
    handleGroundedMessage: vi.fn(),
    handleRestaurantMessage: vi.fn(),
    handleEventVenueBookingMessage: vi.fn(),
    onAgentSend: vi.fn(),
    lastIntent: undefined,
  }),
}));

vi.mock("@/lib/concierge-send-user-message", () => ({
  sendConciergeUserMessage: mocks.sendConciergeUserMessage,
}));
import { ConciergeChatView } from "@/components/chat/concierge-copilot-chat-view";
import {
  EventLocalChatProvider,
  useEventLocalChat,
} from "@/components/chat/event-local-chat-context";

function renderWithAct(component: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(component));
  return {
    container,
    rerender: (next: React.ReactElement) => {
      act(() => root.render(next));
    },
    unmount: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

function TriggerExchange({ clarify = false }: { clarify?: boolean }) {
  const { showClarify, showExchange } = useEventLocalChat();
  useEffect(() => {
    if (clarify) {
      showClarify("search rentals", "Which neighborhood?", "rental");
    } else {
      showExchange("search rentals", "Found 4 rentals");
    }
  }, [clarify, showClarify, showExchange]);
  return null;
}

function TriggerClear() {
  const { clearLocalMessages } = useEventLocalChat();
  useEffect(() => {
    clearLocalMessages();
  }, [clearLocalMessages]);
  return null;
}
describe("Concierge transcript ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agent = { addMessages: mocks.addMessages };
  });

  it("publishes a fast-path exchange into the CopilotKit agent message stream", () => {
    const { unmount } = renderWithAct(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerExchange),
      ),
    );

    expect(mocks.addMessages).toHaveBeenCalledTimes(1);
    expect(mocks.addMessages.mock.calls[0]?.[0]).toMatchObject([
      { role: "user", content: "search rentals" },
      { role: "assistant", content: "Found 4 rentals" },
    ]);
    unmount();
  });

  it("queues a fast-path exchange until the agent becomes available", () => {
    mocks.agent = undefined;
    const { rerender, unmount } = renderWithAct(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerExchange),
      ),
    );

    expect(mocks.addMessages).not.toHaveBeenCalled();

    mocks.agent = { addMessages: mocks.addMessages };
    rerender(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerExchange),
      ),
    );

    expect(mocks.addMessages).toHaveBeenCalledTimes(1);
    expect(mocks.addMessages.mock.calls[0]?.[0]).toMatchObject([
      { role: "user", content: "search rentals" },
      { role: "assistant", content: "Found 4 rentals" },
    ]);
    unmount();
  });

  it("queues a clarification until the agent becomes available", () => {
    mocks.agent = undefined;
    const { rerender, unmount } = renderWithAct(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerExchange, { clarify: true }),
      ),
    );

    expect(mocks.addMessages).not.toHaveBeenCalled();

    mocks.agent = { addMessages: mocks.addMessages };
    rerender(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerExchange, { clarify: true }),
      ),
    );

    expect(mocks.addMessages).toHaveBeenCalledTimes(1);
    expect(mocks.addMessages.mock.calls[0]?.[0]).toMatchObject([
      { role: "user", content: "search rentals" },
      { role: "assistant", content: "Which neighborhood?", isClarify: true },
    ]);
    unmount();
  });

  it("does not replay queued messages after local chat is cleared", () => {
    mocks.agent = undefined;
    const exchange = React.createElement(
      EventLocalChatProvider,
      null,
      React.createElement(TriggerExchange),
    );
    const { rerender, unmount } = renderWithAct(exchange);

    rerender(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerClear),
      ),
    );
    mocks.agent = { addMessages: mocks.addMessages };
    rerender(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerClear),
      ),
    );

    expect(mocks.addMessages).not.toHaveBeenCalled();
    unmount();
  });

  it("publishes a clarification into the same agent message stream", () => {
    const { unmount } = renderWithAct(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(TriggerExchange, { clarify: true }),
      ),
    );

    expect(mocks.addMessages).toHaveBeenCalledTimes(1);
    expect(mocks.addMessages.mock.calls[0]?.[0]).toMatchObject([
      { role: "user", content: "search rentals" },
      { role: "assistant", content: "Which neighborhood?" },
    ]);
    unmount();
  });

  it("preserves the CopilotKit transcript order supplied by the agent", () => {
    const messages = [
      { id: "a1", role: "assistant", content: "older agent reply" },
      { id: "u2", role: "user", content: "search rentals" },
      { id: "a2", role: "assistant", content: "Found 4 rentals" },
    ];
    const { container, unmount } = renderWithAct(
      React.createElement(ConciergeChatView, { messages } as never),
    );

    expect(container.textContent).toBe(
      "older agent replysearch rentalsFound 4 rentals",
    );
    unmount();
  });

  it("does not override CopilotKit welcome-screen ownership", () => {
    const Welcome = () => React.createElement("div", null, "Welcome");
    const { container, unmount } = renderWithAct(
      React.createElement(ConciergeChatView, { welcomeScreen: Welcome }),
    );

    expect(
      container
        .querySelector('[data-testid="copilot-chat-view-mounted"]')
        ?.getAttribute("data-welcome-screen"),
    ).toBe("provided");
    unmount();
  });
});
