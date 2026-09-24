// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  mockUseAgent: vi.fn<() => { agent: unknown }>(() => ({ agent: undefined })),
  mockUseCopilotKit: vi.fn<
    () => {
      copilotkit: {
        runtimeUrl: string | undefined;
        runtimeConnectionStatus: string;
        subscribe: (subscriber: {
          onRuntimeConnectionStatusChanged?: (event: { status: string }) => void;
        }) => { unsubscribe: () => void };
      };
    }
  >(() => ({
    copilotkit: {
      runtimeUrl: "/api/copilotkit",
      runtimeConnectionStatus: "connected",
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
  })),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: mocks.mockUseAgent,
  useCopilotKit: mocks.mockUseCopilotKit,
  UseAgentUpdate: {
    OnStateChanged: "OnStateChanged",
    OnRunStatusChanged: "OnRunStatusChanged",
    OnMessagesChanged: "OnMessagesChanged",
  },
}));

vi.mock("@/lib/types", () => ({
  ConciergeWorkingMemory: {} as Record<string, unknown>,
}));

import {
  ConciergeCoAgentProvider,
  useConciergeCoAgent,
} from "@/components/chat/concierge-coagent-context";

const mockUseAgent = mocks.mockUseAgent;
const mockUseCopilotKit = mocks.mockUseCopilotKit;

function renderWithAct(component: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return {
    unmount: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

function captureReadiness() {
  const captured: { isReady: boolean | null } = { isReady: null };
  const TestComponent = () => {
    captured.isReady = useConciergeCoAgent().isReady;
    return null;
  };
  return { captured, TestComponent };
}

describe("ConciergeCoAgentProvider — readiness behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgent.mockReturnValue({ agent: undefined });
    mockUseCopilotKit.mockReturnValue({
      copilotkit: {
        runtimeUrl: "/api/copilotkit",
        runtimeConnectionStatus: "connected",
        subscribe: () => ({ unsubscribe: () => undefined }),
      },
    });
  });

  it("returns isReady=false when no agent is available", () => {
    const { captured, TestComponent } = captureReadiness();
    const { unmount } = renderWithAct(
      <ConciergeCoAgentProvider>
        <TestComponent />
      </ConciergeCoAgentProvider>,
    );

    expect(captured.isReady).toBe(false);
    unmount();
  });

  it("returns isReady=false when runtimeUrl is missing", () => {
    mockUseAgent.mockReturnValue({ agent: {} });
    mockUseCopilotKit.mockReturnValue({
      copilotkit: {
        runtimeUrl: undefined,
        runtimeConnectionStatus: "connected",
        subscribe: () => ({ unsubscribe: () => undefined }),
      },
    });
    const { captured, TestComponent } = captureReadiness();
    const { unmount } = renderWithAct(
      <ConciergeCoAgentProvider>
        <TestComponent />
      </ConciergeCoAgentProvider>,
    );

    expect(captured.isReady).toBe(false);
    unmount();
  });

  it("returns isReady=false while runtime is connecting", () => {
    mockUseAgent.mockReturnValue({ agent: {} });
    mockUseCopilotKit.mockReturnValue({
      copilotkit: {
        runtimeUrl: "/api/copilotkit",
        runtimeConnectionStatus: "connecting",
        subscribe: () => ({ unsubscribe: () => undefined }),
      },
    });
    const { captured, TestComponent } = captureReadiness();
    const { unmount } = renderWithAct(
      <ConciergeCoAgentProvider>
        <TestComponent />
      </ConciergeCoAgentProvider>,
    );

    expect(captured.isReady).toBe(false);
    unmount();
  });

  it("reacts to the cold runtime connecting -> connected subscription event", () => {
    let onRuntimeConnectionStatusChanged:
      | ((event: { status: string }) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const copilotkit = {
      runtimeUrl: "/api/copilotkit" as string | undefined,
      runtimeConnectionStatus: "connecting",
      subscribe: vi.fn(
        (subscriber: {
          onRuntimeConnectionStatusChanged?: (event: { status: string }) => void;
        }) => {
          onRuntimeConnectionStatusChanged =
            subscriber.onRuntimeConnectionStatusChanged;
          return { unsubscribe };
        },
      ),
    };
    mockUseAgent.mockReturnValue({ agent: { id: "test-agent" } });
    mockUseCopilotKit.mockImplementation(() => ({ copilotkit }));

    const { captured, TestComponent } = captureReadiness();
    const { unmount } = renderWithAct(
      <ConciergeCoAgentProvider>
        <TestComponent />
      </ConciergeCoAgentProvider>,
    );

    expect(captured.isReady).toBe(false);
    expect(copilotkit.subscribe).toHaveBeenCalledOnce();

    act(() => {
      copilotkit.runtimeConnectionStatus = "connected";
      onRuntimeConnectionStatusChanged?.({ status: "connected" });
    });

    expect(captured.isReady).toBe(true);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("returns isReady=true when runtime is already connected", () => {
    mockUseAgent.mockReturnValue({ agent: { id: "test-agent" } });
    const { captured, TestComponent } = captureReadiness();
    const { unmount } = renderWithAct(
      <ConciergeCoAgentProvider>
        <TestComponent />
      </ConciergeCoAgentProvider>,
    );

    expect(captured.isReady).toBe(true);
    unmount();
  });
});
