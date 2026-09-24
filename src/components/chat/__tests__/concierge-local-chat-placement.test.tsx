// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Mock CopilotKit — vi.hoisted so the factory can reference it before initialization
const copilotMocks = vi.hoisted(() => {
  const MockCopilotChatView = vi.fn(({ children, scrollView, ...props }: Record<string, unknown>) => {
    const ScrollViewComponent = scrollView as React.ComponentType<Record<string, unknown>>;
    return React.createElement(
      "div",
      { "data-testid": "copilot-chat-view-mounted", ...props },
      React.createElement(ScrollViewComponent, {}, children as React.ReactNode)
    );
  });
  return Object.assign(MockCopilotChatView, {
    ScrollView: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-testid": "copilot-scroll-view" }, children),
  });
});

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatView: copilotMocks,
  useAgent: vi.fn(() => ({ agent: { id: "test-agent" } })),
  useCopilotKit: vi.fn(() => ({
    runtimeUrl: "/api/copilotkit",
    runtimeConnectionStatus: "connected",
  })),
  UseAgentUpdate: {
    OnStateChanged: "OnStateChanged",
    OnRunStatusChanged: "OnRunStatusChanged",
    OnMessagesChanged: "OnMessagesChanged",
  },
}));

vi.mock("@/lib/types", () => ({
  ConciergeWorkingMemory: {} as Record<string, unknown>,
}));

// Mock the local chat context
vi.mock("@/components/chat/event-local-chat-context", () => ({
  EventLocalChatProvider: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-testid": "event-local-chat-provider" }, children),
  useEventLocalChat: vi.fn(() => ({ messages: [] })),
}));

// Mock the send handlers to avoid needing all the fast-path providers
vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({
  useConciergeSendHandlers: vi.fn(() => ({
    handleRentalMessage: vi.fn(),
    handleEventMessage: vi.fn(),
    handleGroundedMessage: vi.fn(),
    handleRestaurantMessage: vi.fn(),
    handleEventVenueBookingMessage: vi.fn(),
    onAgentSend: vi.fn(),
    lastIntent: undefined,
  })),
}));

// Mock the local chat hook
vi.mock("@/components/chat/use-concierge-local-chat", () => ({
  useConciergeLocalChat: vi.fn(() => ({ messages: [] })),
}));

// Mock the send user message function
vi.mock("@/lib/concierge-send-user-message", () => ({
  sendConciergeUserMessage: vi.fn(() => Promise.resolve(true)),
}));

import { ConciergeChatView } from "@/components/chat/concierge-copilot-chat-view";
import { ConciergeCoAgentProvider } from "@/components/chat/concierge-coagent-context";
import { useConciergeLocalChat } from "@/components/chat/use-concierge-local-chat";

const mockUseConciergeLocalChat = vi.mocked(useConciergeLocalChat);

function renderWithAct(component: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return {
    container,
    unmount: () => {
      root.unmount();
      document.body.removeChild(container);
    },
  };
}

function setLocalMessages(count: number) {
  const messages = Array.from({ length: count }, (_, i) => ({
    id: `local-${i + 1}`,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: i % 2 === 0 ? `search ${i + 1}` : `result ${i + 1}`,
  }));
  mockUseConciergeLocalChat.mockReturnValue({
    messages,
    clarifyPending: false,
    clarifyKind: null,
    showClarify: vi.fn(),
    showExchange: vi.fn(),
    clearLocalMessages: vi.fn(),
  });
  return messages;
}

describe("Concierge local fast-path transcript placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks does not reset mockReturnValue implementations — reset explicitly
    mockUseConciergeLocalChat.mockReturnValue({
      messages: [],
      clarifyPending: false,
      clarifyKind: null,
      showClarify: vi.fn(),
      showExchange: vi.fn(),
      clearLocalMessages: vi.fn(),
    });
  });

  it("renders local messages inside the chat scroll area", () => {
    setLocalMessages(2);

    const { container, unmount } = renderWithAct(
      React.createElement(
        ConciergeCoAgentProvider,
        null,
        React.createElement(ConciergeChatView, null)
      )
    );

    const localEl = container.querySelector('[data-testid="concierge-local-chat-messages"]');
    const scrollEl = container.querySelector('[data-testid="copilot-scroll-view"]');

    expect(localEl).toBeTruthy();
    expect(scrollEl).toBeTruthy();
    // Local messages live inside the scrollable transcript
    expect(scrollEl!.contains(localEl!)).toBe(true);
    unmount();
  });

  it("renders local messages before mocked agent children (chronological order)", () => {
    setLocalMessages(2);

    const { container, unmount } = renderWithAct(
      React.createElement(
        ConciergeCoAgentProvider,
        null,
        React.createElement(ConciergeChatView, null)
      )
    );

    const localEl = container.querySelector('[data-testid="concierge-local-chat-messages"]');
    const childrenEl = container.querySelector('[data-testid="copilot-chat-view-mounted"]');
    const scrollEl = container.querySelector('[data-testid="copilot-scroll-view"]');

    expect(localEl).toBeTruthy();
    expect(childrenEl).toBeTruthy();
    // Local messages live inside the mounted transcript area
    expect(childrenEl!.contains(localEl!)).toBe(true);
    // Local messages render first inside the scroll area — before agent content
    expect(scrollEl!.firstElementChild!.contains(localEl!)).toBe(true);
    unmount();
  });

  it("hides welcome screen when local messages exist", () => {
    setLocalMessages(2);

    const { container, unmount } = renderWithAct(
      React.createElement(
        ConciergeCoAgentProvider,
        null,
        React.createElement(ConciergeChatView, null)
      )
    );

    const localEl = container.querySelector('[data-testid="concierge-local-chat-messages"]');
    expect(localEl).toBeTruthy();
    expect(container.textContent).toContain("result 2");
    unmount();
  });

  it("preserves welcome screen when local messages are empty", () => {
    // beforeEach reset leaves messages empty — component renders nothing
    const { container, unmount } = renderWithAct(
      React.createElement(
        ConciergeCoAgentProvider,
        null,
        React.createElement(ConciergeChatView, null)
      )
    );

    const localEl = container.querySelector('[data-testid="concierge-local-chat-messages"]');
    expect(localEl).toBeNull();
    unmount();
  });
});
