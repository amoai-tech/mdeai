// @vitest-environment jsdom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SAN-1592 — the discovery provider and /chat must classify an expected guest
 * startup 401 the same way.
 *
 * CopilotKit is replaced by a stub that exposes the `onError` prop, because the
 * rule under test is MDE's classification, not CopilotKit's transport. Driving a
 * real 401 here would depend on a live runtime and would reintroduce exactly the
 * network flake this guard exists to absorb.
 *
 * The pre-fix failure: `DiscoveryConciergeProvider` reported every error, so a
 * guest's expected probe wrote a failure snapshot that other surfaces read.
 */

const session = vi.hoisted(() => ({
  userId: null as string | null,
  loading: false,
}));
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    user: session.userId ? { id: session.userId } : null,
    loading: session.loading,
  }),
}));

const navigation = vi.hoisted(() => ({ pathname: "/restaurants" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  ConciergeCoAgentProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/** Capture the provider's onError so the test can deliver exact CopilotKit events. */
const captured = vi.hoisted(() => ({
  onError: undefined as undefined | ((event: unknown) => void),
  mounts: 0,
  unmounts: 0,
  agents: [] as object[],
}));
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: ({
    children,
    onError,
  }: {
    children: React.ReactNode;
    onError?: (event: unknown) => void;
  }) => {
    // This token models the CopilotKit runtime instance owned by each provider.
    const agent = React.useRef<object>({});
    React.useEffect(() => {
      captured.mounts += 1;
      captured.agents.push(agent.current);
      return () => { captured.unmounts += 1; };
    }, []);
    captured.onError = onError;
    return <>{children}</>;
  },
  CopilotChatConfigurationProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { MdeCopilotKitProvider } from "@/components/copilot/copilot-kit-provider";
import {
  clearConciergeError,
  getConciergeErrorForThread,
  getConciergeErrorVersion,
} from "@/lib/concierge-error-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The exact shape the pinned CopilotKit 1.75 emits for a refused `/info` probe:
 * `{ code: "runtime_info_fetch_failed", error: { runtimeInfoStatus } }`.
 */
function runtimeInfoError(status: number) {
  return { code: "runtime_info_fetch_failed", error: { runtimeInfoStatus: status } };
}

function agentRunFailure() {
  return { code: "agent_run_failed", error: { message: "Ollama unavailable" } };
}

let container: HTMLDivElement;
let root: Root;

function renderProvider() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MdeCopilotKitProvider>
        <div>page</div>
      </MdeCopilotKitProvider>,
    );
  });
}

function emit(event: unknown) {
  if (!captured.onError) throw new Error("provider did not pass onError");
  act(() => captured.onError?.(event));
}

beforeEach(() => {
  session.userId = null;
  session.loading = false;
  navigation.pathname = "/restaurants";
  captured.onError = undefined;
  captured.mounts = 0;
  captured.unmounts = 0;
  captured.agents = [];
  clearConciergeError();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("DiscoveryConciergeProvider guest startup 401 (SAN-1592)", () => {
  it("does not record an expected guest startup 401 as a concierge failure", () => {
    renderProvider();
    emit(runtimeInfoError(401));

    expect(getConciergeErrorVersion()).toBe(0);
    expect(getConciergeErrorForThread(undefined).version).toBe(0);
  });

  it("defers the cold connection, preserves the agent through loading toggles, and replaces it on identity change", () => {
    const rerender = () => act(() => root.render(
      <MdeCopilotKitProvider><div>page</div></MdeCopilotKitProvider>,
    ));
    session.loading = true;
    renderProvider();
    expect(captured.mounts).toBe(0); // no guest /info probe while restoring

    session.loading = false;
    session.userId = "signed-in-owner";
    rerender();
    expect(captured.mounts).toBe(1);
    const signedInAgent = captured.agents[0];

    session.loading = true; // transient status refresh, SAME owner
    rerender();
    expect(captured.mounts).toBe(1);
    expect(captured.unmounts).toBe(0);
    session.loading = false;
    rerender();
    expect(captured.agents.at(-1)).toBe(signedInAgent);

    session.userId = "another-owner";
    rerender();
    expect(captured.mounts).toBe(2);
    expect(captured.unmounts).toBe(1);
    expect(captured.agents[1]).not.toBe(signedInAgent);
  });

  it("rebinds guest to authenticated identity without sharing its prior agent", () => {
    renderProvider();
    const guestAgent = captured.agents[0];
    session.userId = "signed-in-owner";
    act(() => root.render(<MdeCopilotKitProvider><div>page</div></MdeCopilotKitProvider>));
    expect(captured.agents).toHaveLength(2);
    expect(captured.agents[1]).not.toBe(guestAgent);
  });

  it("does not remount for the same authenticated user on a normal re-render", () => {
    session.userId = "stable-owner";
    renderProvider();
    act(() => root.render(<MdeCopilotKitProvider><div>page</div></MdeCopilotKitProvider>));
    expect(captured.mounts).toBe(1);
    expect(captured.unmounts).toBe(0);
  });

  it("still records a startup failure for a signed-in user", () => {
    session.userId = "user-1";
    renderProvider();
    emit(runtimeInfoError(401));

    expect(getConciergeErrorVersion()).toBeGreaterThan(0);
  });

  it("still records a real 5xx startup failure for a signed-in user", () => {
    session.userId = "user-1";
    renderProvider();
    emit(runtimeInfoError(500));

    expect(getConciergeErrorVersion()).toBeGreaterThan(0);
  });

  it("does not mount an unauthenticated runtime while restoring a cold session", () => {
    session.loading = true;
    renderProvider();
    expect(captured.mounts).toBe(0);
    expect(captured.onError).toBeUndefined();
    expect(getConciergeErrorVersion()).toBe(0);
  });

  it("records a guest agent-run failure, not only startup probes", () => {
    renderProvider();
    emit(agentRunFailure());

    expect(getConciergeErrorVersion()).toBeGreaterThan(0);
  });
});
