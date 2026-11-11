// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SAN-1412 — opening a saved chat that has no real title yet asks the server to name it, in the
 * background. Opening is never held up by it, and a chat that already has a title is left alone.
 */
const ui = vi.hoisted(() => ({
  push: vi.fn(),
  setActiveThreadId: vi.fn(),
  stopActiveRun: vi.fn(),
  startNewChat: vi.fn(),
  activeThreadId: null as string | null,
  sessionThreadId: "session-thread" as string,
  restoringSavedThread: false,
  ensure: vi.fn(),
  threads: [] as Array<{ id: string; title: string | null; updatedAt: string }>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: ui.push }) }));
vi.mock("@/components/chat/concierge-session-context", () => ({
  useConciergeSession: () => ({ startNewChat: ui.startNewChat, stopActiveRun: ui.stopActiveRun }),
}));
vi.mock("@/lib/chat/thread-nav-context", () => ({
  useThreadNav: () => ({
    activeThreadId: ui.activeThreadId,
    sessionThreadId: ui.sessionThreadId,
    restoringSavedThread: ui.restoringSavedThread,
    setActiveThreadId: ui.setActiveThreadId,
    clearActiveThread: vi.fn(),
  }),
}));
vi.mock("@/lib/chat/use-nav-threads", () => ({
  useNavThreads: () => ({ threads: ui.threads, loading: false, error: false, refresh: vi.fn() }),
}));
vi.mock("@/lib/chat/ensure-thread-title", () => ({ ensureThreadTitle: (id: string) => ui.ensure(id) }));

import { ChatNavRail } from "@/components/chat/chat-nav-rail";

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ui.push.mockReset();
  ui.setActiveThreadId.mockReset();
  ui.stopActiveRun.mockReset();
  ui.startNewChat.mockReset();
  ui.activeThreadId = null;
  ui.sessionThreadId = "session-thread";
  ui.restoringSavedThread = false;
  ui.ensure.mockReset();
  ui.ensure.mockResolvedValue(true);
  ui.threads = [
    { id: "untitled", title: null, updatedAt: "2026-10-16T12:00:00Z" },
    { id: "titled", title: "Weekend events", updatedAt: "2026-10-15T12:00:00Z" },
  ];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const open = (id: string) => {
  act(() => {
    (container.querySelector(`[data-thread-id="${id}"]`) as HTMLElement).click();
  });
};

describe("ChatNavRail opening a saved chat (SAN-1412)", () => {
  it("asks for a title when the chat has none, and still opens it straight away", () => {
    act(() => {
      root.render(<ChatNavRail />);
    });
    open("untitled");
    expect(ui.ensure).toHaveBeenCalledWith("untitled");
    expect(ui.stopActiveRun).toHaveBeenCalledTimes(1);
    expect(ui.setActiveThreadId).toHaveBeenCalledWith("untitled");
    expect(ui.push).toHaveBeenCalledWith("/chat");
  });

  it("repairs the literal Mastra placeholder title when opening an older chat", () => {
    ui.threads = [
      { id: "placeholder", title: "Untitled Thread", updatedAt: "2026-10-16T12:00:00Z" },
    ];
    act(() => {
      root.render(<ChatNavRail />);
    });
    open("placeholder");
    expect(ui.ensure).toHaveBeenCalledWith("placeholder");
    expect(ui.setActiveThreadId).toHaveBeenCalledWith("placeholder");
  });

  it("leaves a chat that already has a title alone", () => {
    act(() => {
      root.render(<ChatNavRail />);
    });
    open("titled");
    expect(ui.ensure).not.toHaveBeenCalled();
    expect(ui.push).toHaveBeenCalledWith("/chat");
  });

  it("does not wait for the title: a title request that never answers cannot hold up opening", () => {
    ui.ensure.mockReturnValue(new Promise<never>(() => {
      // Intentionally never resolves: opening a chat must not await a title request.
    }));
    act(() => {
      root.render(<ChatNavRail />);
    });
    open("untitled");
    expect(ui.push).toHaveBeenCalledWith("/chat");
  });
});

describe("ChatNavRail re-clicking the open chat (SAN-1639)", () => {
  it("does not reset, detach or navigate when the clicked chat is already active", () => {
    ui.activeThreadId = "titled";
    act(() => {
      root.render(<ChatNavRail />);
    });
    open("titled");

    // The reset is what erased the transcript the click was meant to show.
    expect(ui.startNewChat).not.toHaveBeenCalled();
    expect(ui.stopActiveRun).not.toHaveBeenCalled();
    expect(ui.setActiveThreadId).not.toHaveBeenCalled();
    expect(ui.push).not.toHaveBeenCalled();
  });

  it("still switches normally when a different chat is clicked", () => {
    ui.activeThreadId = "titled";
    act(() => {
      root.render(<ChatNavRail />);
    });
    open("untitled");

    expect(ui.startNewChat).toHaveBeenCalledTimes(1);
    expect(ui.stopActiveRun).toHaveBeenCalledTimes(1);
    expect(ui.setActiveThreadId).toHaveBeenCalledWith("untitled");
    expect(ui.push).toHaveBeenCalledWith("/chat");
  });
});

describe("ChatNavRail implicit and restoring threads (SAN-1639)", () => {
  it("treats the tab's own session thread as already open", () => {
    // A fresh tab runs its first turn on sessionThreadId before any selection exists.
    ui.activeThreadId = null;
    ui.sessionThreadId = "untitled";
    act(() => { root.render(<ChatNavRail />); });
    open("untitled");
    expect(ui.startNewChat).not.toHaveBeenCalled();
    expect(ui.stopActiveRun).not.toHaveBeenCalled();
    expect(ui.setActiveThreadId).not.toHaveBeenCalled();
  });

  it("does not reset the transcript while a saved-thread restore is still pending", () => {
    ui.activeThreadId = null;
    ui.sessionThreadId = "session-thread";
    ui.restoringSavedThread = true;
    act(() => { root.render(<ChatNavRail />); });
    open("untitled");
    // The provider would reject this selection anyway; resetting only clears the view.
    expect(ui.startNewChat).not.toHaveBeenCalled();
    expect(ui.stopActiveRun).not.toHaveBeenCalled();
  });

  it("retries a failed title repair when the open chat has no real title", () => {
    ui.activeThreadId = "untitled";
    ui.threads = [{ id: "untitled", title: null, updatedAt: "2026-10-16T12:00:00Z" }];
    act(() => { root.render(<ChatNavRail />); });
    open("untitled");
    expect(ui.ensure).toHaveBeenCalledWith("untitled");
    expect(ui.startNewChat).not.toHaveBeenCalled();
  });
});
