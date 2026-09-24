// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Use vi.hoisted to define mocks before vi.mock runs
const mocks = vi.hoisted(() => ({
  mockUseAgent: vi.fn<() => { agent: unknown }>(() => ({ agent: undefined })),
  mockUseCopilotKit: vi.fn<
    () => { copilotkit: { runtimeUrl: string | undefined; runtimeConnectionStatus: string } }
  >(() => ({
    copilotkit: {
      runtimeUrl: "/api/copilotkit",
      runtimeConnectionStatus: "connected",
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

import { ConciergeCoAgentProvider, useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";

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
    container,
    unmount: () => {
      root.unmount();
      document.body.removeChild(container);
    },
  };
}

describe("ConciergeCoAgentProvider — readiness behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgent.mockReturnValue({ agent: undefined });
    mockUseCopilotKit.mockReturnValue({
      copilotkit: {
        runtimeUrl: "/api/copilotkit",
        runtimeConnectionStatus: "connected",
      },
    });
  });

  it("returns isReady=false when no agent is available", () => {
    mockUseAgent.mockReturnValue({ agent: undefined });

    const captured: { isReady: boolean | null } = { isReady: null };
    const TestComponent = () => {
      captured.isReady = useConciergeCoAgent().isReady;
      return null;
    };

    const { unmount } = renderWithAct(
      React.createElement(ConciergeCoAgentProvider, null, React.createElement(TestComponent))
    );
    unmount();

    expect(captured.isReady).toBe(false);
  });

  it("returns isReady=false when copilotkit runtimeUrl is undefined", () => {
    mockUseAgent.mockReturnValue({ agent: {} });
    mockUseCopilotKit.mockReturnValue({
      copilotkit: {
        runtimeUrl: undefined,
        runtimeConnectionStatus: "connected",
      },
    });

    const captured: { isReady: boolean | null } = { isReady: null };
    const TestComponent = () => {
      captured.isReady = useConciergeCoAgent().isReady;
      return null;
    };

    const { unmount } = renderWithAct(
      React.createElement(ConciergeCoAgentProvider, null, React.createElement(TestComponent))
    );
    unmount();

    expect(captured.isReady).toBe(false);
  });

  it("returns isReady=false when runtimeConnectionStatus is not connected", () => {
    mockUseAgent.mockReturnValue({ agent: {} });
    mockUseCopilotKit.mockReturnValue({
      copilotkit: {
        runtimeUrl: "/api/copilotkit",
        runtimeConnectionStatus: "connecting",
      },
    });

    const captured: { isReady: boolean | null } = { isReady: null };
    const TestComponent = () => {
      captured.isReady = useConciergeCoAgent().isReady;
      return null;
    };

    const { unmount } = renderWithAct(
      React.createElement(ConciergeCoAgentProvider, null, React.createElement(TestComponent))
    );
    unmount();

    expect(captured.isReady).toBe(false);
  });

  it("returns isReady=true when runtime is connected and agent exists", () => {
    mockUseAgent.mockReturnValue({ agent: { id: "test-agent" } });
    mockUseCopilotKit.mockReturnValue({
      copilotkit: {
        runtimeUrl: "/api/copilotkit",
        runtimeConnectionStatus: "connected",
      },
    });

    const captured: { isReady: boolean | null } = { isReady: null };
    const TestComponent = () => {
      captured.isReady = useConciergeCoAgent().isReady;
      return null;
    };

    const { unmount } = renderWithAct(
      React.createElement(ConciergeCoAgentProvider, null, React.createElement(TestComponent))
    );
    unmount();

    expect(captured.isReady).toBe(true);
  });

  it("does not use private runtimeMode field", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sourceText = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/chat/concierge-coagent-context.tsx"),
      "utf8",
    );
    expect(sourceText).not.toContain("runtimeMode");
  });
});