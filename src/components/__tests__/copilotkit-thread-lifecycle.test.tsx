// @vitest-environment jsdom
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopilotChatConfiguration } from "@copilotkit/react-core/v2";

import { HostEventProvider } from "@/components/host/host-event-provider";
import { HostOsShell } from "@/components/host/host-os-shell";

// The shell's own chrome is not under test; its provider boundary is. The
// header renders a probe so the test proves a component OUTSIDE the routed
// page shares the page's thread.
const navigation = vi.hoisted(() => ({ pathname: "/host/dashboard" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/host/host-context-provider", () => ({
  HostContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/host/host-os-header", () => ({
  HostOsHeader: () => <Probe name="header" />,
}));
vi.mock("@/components/host/host-os-body", () => ({
  CHAT_REGION_ID: "host-chat",
  HostOsBody: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * SAN-1378 · Stage D — thread identity per CopilotKit provider boundary.
 *
 * Renders the REAL providers (CopilotKit is not mocked) and reads the live
 * thread from `useCopilotChatConfiguration` in two separate consumers, because
 * the failure modes are invisible to typecheck, lint and floor:
 *
 * - two consumers on one screen silently minting different threads;
 * - an auto-minted id passed as explicit, which disables New Chat and makes a
 *   fresh chat try to reconnect to a thread that does not exist;
 * - a fresh session that is not fresh on remount.
 *
 * The runtime is unreachable here on purpose; thread identity is decided on
 * the client before any request is made.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Seen = { threadId: string | undefined; explicit: boolean | undefined };
const seen: Record<string, Seen> = {};

function Probe({ name }: { name: string }) {
  const config = useCopilotChatConfiguration();
  const threadId = config?.threadId;
  const explicit = config?.hasExplicitThreadId;
  useEffect(() => {
    seen[name] = { threadId, explicit };
  }, [name, threadId, explicit]);
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

beforeEach(() => {
  for (const key of Object.keys(seen)) delete seen[key];
  // No runtime in a unit test: fail fast instead of hanging on a real fetch.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HostEventProvider — fresh wizard session", () => {
  it("gives every consumer in the wizard the same non-explicit thread", async () => {
    await render(
      <HostEventProvider>
        <Probe name="chat" />
        <Probe name="wizardState" />
      </HostEventProvider>,
    );

    expect(seen.chat.threadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen.wizardState.threadId).toBe(seen.chat.threadId);
    // Non-explicit: a brand-new wizard must not try to reconnect to a thread
    // that has never been run.
    expect(seen.chat.explicit).toBe(false);
  });

  it("starts a new thread when the wizard is mounted again", async () => {
    await render(
      <HostEventProvider key="first">
        <Probe name="chat" />
      </HostEventProvider>,
    );
    const first = seen.chat.threadId;

    await render(
      <HostEventProvider key="second">
        <Probe name="chat" />
      </HostEventProvider>,
    );

    expect(seen.chat.threadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen.chat.threadId).not.toBe(first);
  });
});

describe("HostOsShell — one persistent host workspace thread", () => {
  it("keeps one thread across Overview, Events and Analytics, shared with the header", async () => {
    const ids: (string | undefined)[] = [];
    for (const pathname of ["/host/dashboard", "/host/events", "/host/analytics"]) {
      navigation.pathname = pathname;
      // Same element type at the same position: React keeps the shell
      // mounted, exactly as the host layout does on client-side navigation.
      await render(
        <HostOsShell>
          <Probe name="page" />
        </HostOsShell>,
      );
      expect(seen.header.threadId).toBe(seen.page.threadId);
      ids.push(seen.page.threadId);
    }

    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(ids).size).toBe(1);
    expect(seen.page.explicit).toBe(false);
  });
});
