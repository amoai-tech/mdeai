// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatProvider } from "@/components/chat/chat-provider";
import { clearConciergeError, getConciergeErrorForThread } from "@/lib/concierge-error-store";

const session = vi.hoisted(() => ({
  loading: true,
  user: null as { id: string } | null,
  onError: null as ((...args: [unknown]) => void) | null,
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
    onError: (...args: [unknown]) => void;
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
  act(() => { root.render(<ChatProvider><span>Chat</span></ChatProvider>); });
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
  act(() => { root.unmount(); });
  container.remove();
  clearConciergeError();
});

describe("concierge provider auth/error transitions", () => {
  it("does not mount the runtime before initial auth resolution", () => {
    render();
    // There is no callback and no runtime request to fail while auth is unknown.
    expect(session.onError).toBeNull();
    expect(container.textContent).toBe("");

    session.loading = false;
    render();
    expect(session.onError).toBeTypeOf("function");
    act(() => { session.onError?.(startup401); });
    expect(getConciergeErrorForThread("guest-thread").version).toBe(0);
  });

  it("ignores a late 401 from an old guest provider after sign-in", () => {
    session.loading = false;
    render();
    const guestRequestError = session.onError;
    expect(guestRequestError).toBeTypeOf("function");

    session.user = { id: "user-a" };
    render();
    expect(session.onError).not.toBe(guestRequestError);

    // A guest request must not become a signed-in failure merely because the
    // session changed before its response completed.
    act(() => { guestRequestError?.(startup401); });
    expect(getConciergeErrorForThread("guest-thread").version).toBe(0);
  });

  it("reports an actual 401 from the signed-in provider", () => {
    render();
    expect(session.onError).toBeNull();
    session.user = { id: "user-a" };
    session.loading = false;
    render();
    expect(session.onError).toBeTypeOf("function");
    act(() => { session.onError?.(startup401); });
    expect(getConciergeErrorForThread("guest-thread").version).toBeGreaterThan(0);
  });

  it("reports genuine agent-run failures after sign-in", () => {
    session.user = { id: "user-a" };
    session.loading = false;
    render();
    expect(session.onError).toBeTypeOf("function");
    act(() => { session.onError?.({ code: "agent_run_failed" }); });
    expect(getConciergeErrorForThread("guest-thread").version).toBeGreaterThan(0);
  });

  it("keeps reporting genuine failures during a signed-in session refresh", () => {
    session.user = { id: "user-a" };
    session.loading = false;
    render();
    session.loading = true;
    render();
    expect(session.onError).toBeTypeOf("function");
    act(() => { session.onError?.({ code: "agent_run_failed" }); });
    expect(getConciergeErrorForThread("guest-thread").version).toBeGreaterThan(0);
  });
});
