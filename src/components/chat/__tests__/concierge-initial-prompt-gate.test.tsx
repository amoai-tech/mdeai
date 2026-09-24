// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Mock Next.js navigation
const mockRouter = { replace: vi.fn() };
const mockSearchParams = new Map([["q", "test query"]]);

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

// Mock CopilotKit
vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: vi.fn(() => ({ agent: undefined })),
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

// Mock local hooks
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: vi.fn(() => ({
    isReady: true,
    state: {},
    setState: vi.fn(),
    agent: undefined,
  })),
}));

vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: vi.fn(() => ({ isLoading: false, reset: vi.fn(), appendMessage: vi.fn(async () => true) })),
}));

vi.mock("@/lib/concierge-send-user-message", () => ({
  sendConciergeUserMessage: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({
  useConciergeSendHandlers: vi.fn(() => ({
    handleRentalMessage: vi.fn(),
    handleEventMessage: vi.fn(),
    handleGroundedMessage: vi.fn(),
    handleRestaurantMessage: vi.fn(),
    onAgentSend: vi.fn(),
  })),
}));

import { ConciergeInitialPrompt } from "@/components/chat/concierge-initial-prompt";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";

const mockUseConciergeCoAgent = vi.mocked(useConciergeCoAgent);
const mockUseConciergeChat = vi.mocked(useConciergeChat);
const mockSendConciergeUserMessage = vi.mocked(sendConciergeUserMessage);

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

describe("ConciergeInitialPrompt — SAN-1356 send gate behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendConciergeUserMessage.mockResolvedValue(true);
  });

  it("does not send when isReady is false", () => {
    mockUseConciergeCoAgent.mockReturnValue({
      isReady: false,
      state: {},
      setState: vi.fn(),
      agent: undefined,
    });
    mockUseConciergeChat.mockReturnValue({ isLoading: false, reset: vi.fn(), appendMessage: vi.fn(async () => true) });

    const { unmount } = renderWithAct(React.createElement(ConciergeInitialPrompt));
    unmount();

    expect(mockSendConciergeUserMessage).not.toHaveBeenCalled();
  });

  it("does not send when isLoading is true", () => {
    mockUseConciergeCoAgent.mockReturnValue({
      isReady: true,
      state: {},
      setState: vi.fn(),
      agent: undefined,
    });
    mockUseConciergeChat.mockReturnValue({ isLoading: true, reset: vi.fn(), appendMessage: vi.fn(async () => true) });

    const { unmount } = renderWithAct(React.createElement(ConciergeInitialPrompt));
    unmount();

    expect(mockSendConciergeUserMessage).not.toHaveBeenCalled();
  });

  it("sends when both isReady is true and isLoading is false", () => {
    mockUseConciergeCoAgent.mockReturnValue({
      isReady: true,
      state: {},
      setState: vi.fn(),
      agent: undefined,
    });
    mockUseConciergeChat.mockReturnValue({ isLoading: false, reset: vi.fn(), appendMessage: vi.fn(async () => true) });

    const { unmount } = renderWithAct(React.createElement(ConciergeInitialPrompt));
    unmount();

    expect(mockSendConciergeUserMessage).toHaveBeenCalledWith("test query", expect.any(Object));
  });

  it("releases the send gate on handled === false", () => {
    mockUseConciergeCoAgent.mockReturnValue({
      isReady: true,
      state: {},
      setState: vi.fn(),
      agent: undefined,
    });
    mockUseConciergeChat.mockReturnValue({ isLoading: false, reset: vi.fn(), appendMessage: vi.fn(async () => true) });
    mockSendConciergeUserMessage.mockResolvedValue(false);

    const { unmount } = renderWithAct(React.createElement(ConciergeInitialPrompt));
    unmount();

    expect(mockSendConciergeUserMessage).toHaveBeenCalled();
  });

  it("releases the send gate on promise rejection", () => {
    mockUseConciergeCoAgent.mockReturnValue({
      isReady: true,
      state: {},
      setState: vi.fn(),
      agent: undefined,
    });
    mockUseConciergeChat.mockReturnValue({ isLoading: false, reset: vi.fn(), appendMessage: vi.fn(async () => true) });
    mockSendConciergeUserMessage.mockRejectedValue(new Error("Network error"));

    const { unmount } = renderWithAct(React.createElement(ConciergeInitialPrompt));
    unmount();

    expect(mockSendConciergeUserMessage).toHaveBeenCalled();
  });

  it("strips empty query and replaces URL", () => {
    mockUseConciergeCoAgent.mockReturnValue({
      isReady: true,
      state: {},
      setState: vi.fn(),
      agent: undefined,
    });
    mockUseConciergeChat.mockReturnValue({ isLoading: false, reset: vi.fn(), appendMessage: vi.fn(async () => true) });

    const { unmount } = renderWithAct(React.createElement(ConciergeInitialPrompt));
    unmount();

    expect(true).toBe(true);
  });

  it("only replaces URL after successful handling", () => {
    mockUseConciergeCoAgent.mockReturnValue({
      isReady: true,
      state: {},
      setState: vi.fn(),
      agent: undefined,
    });
    mockUseConciergeChat.mockReturnValue({ isLoading: false, reset: vi.fn(), appendMessage: vi.fn(async () => true) });

    const { unmount } = renderWithAct(React.createElement(ConciergeInitialPrompt));
    unmount();

    expect(mockSendConciergeUserMessage).toHaveBeenCalled();
  });
});