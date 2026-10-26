// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatProvider } from "@/components/chat/chat-provider";
import { clearConciergeError, getConciergeErrorForThread } from "@/lib/concierge-error-store";

const session = vi.hoisted(() => ({
  loading: true,
  user: null as { id: string } | null,
  onError: null as ((event: unknown) => void) | null,
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ loading: session.loading, user: session.user }),
}));
vi.mock("@/lib/chat/thread-nav-context", () => ({
  useThreadNav: () => ({
    sessionThreadId: "guest-thread",
    activeThreadId: undefined,
    hasPersistedThread: false,
    restoredThread: false,
  }),
}));
vi.mock("@/lib/copilotkit-client-props", () => ({
  getCopilotKitClientProps: () => ({}),
}));
vi.mock("@/lib/deterministic-e2e", () => ({
  isDeterministicE2E: () => false,
}));
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: ({
    children,
    onError,
  }: {
    children: React.ReactNode;
    onError: (event: unknown) => void;
  }) => {
    session.onError = onError;
    return children;
  },
  CopilotChatConfigurationProvider: ({ children }: { children: React.ReactNode }) => children,
  UseAgentUpdate: { OnRunStatusChanged: 1 },
  useAgent: () => ({ agent: undefined }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const startup401 = { code: "runtime_info_fetch_failed", context: { runtimeStatus: 401 } };
let root: Root;
let container: HTMLDivElement;

function render() {
  act(() => root.render(<ChatProvider><span>Chat</span></ChatProvider>));
}

beforeEach(() => {
  clearConciergeError();
  session.loading = true;
  session.user = null;
  session.onError = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  clearConciergeError();
});

describe("guest CopilotKit startup while session resolves", () => {
  it("never shows a failed-turn notice for a guest's early 401", () => {
    render();
    act(() => session.onError?.(startup401));
    expect(getConciergeErrorForThread("guest-thread").version).toBe(0);
    session.loading = false;
    render();
    expect(getConciergeErrorForThread("guest-thread").version).toBe(0);
  });

  it("reports a pending 401 when the session resolves authenticated", () => {
    render();
    act(() => session.onError?.(startup401));
    session.user = { id: "user-a" };
    session.loading = false;
    render();
    expect(getConciergeErrorForThread("guest-thread").version).toBeGreaterThan(0);
  });

  it("immediately reports a real agent-run failure even before auth settles", () => {
    render();
    act(() => session.onError?.({ code: "agent_run_failed" }));
    expect(getConciergeErrorForThread("guest-thread").version).toBeGreaterThan(0);
  });
});
