// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConciergeRunFeedback } from "@/components/chat/concierge-run-feedback";
import { clearConciergeError, reportConciergeError } from "@/lib/concierge-error-store";

const mocks = vi.hoisted(() => ({
  loading: true,
  thread: "thread-a",
  stop: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("@/lib/chat/thread-nav-context", () => ({
  useOptionalThreadNav: () => ({ activeThreadId: mocks.thread, sessionThreadId: "thread-a" }),
}));

vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({
    isLoading: mocks.loading,
    stopActiveRun: mocks.stop,
    retryLastTurn: mocks.retry,
  }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<ConciergeRunFeedback />));
  return container;
}

beforeEach(() => {
  clearConciergeError();
  mocks.loading = true;
  mocks.thread = "thread-a";
  mocks.stop.mockReset();
  mocks.retry.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  clearConciergeError();
});

describe("ConciergeRunFeedback", () => {
  it("shows Stop while a run is active and calls the controller", () => {
    const view = mount();
    const stop = view.querySelector('[data-testid="concierge-stop"]');
    expect(stop).toBeTruthy();
    expect(stop?.getAttribute("aria-label")).toBe("Stop");
    act(() => stop?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("shows Retry after an error and calls the existing-turn retry", () => {
    mocks.loading = false;
    reportConciergeError("thread-a");
    const view = mount();
    expect(view.querySelector('[data-testid="concierge-error-notice"]')).toBeTruthy();
    act(() => {
      Array.from(view.querySelectorAll("button"))
        .find((button) => button.textContent === "Try again ↻")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });

  it("does not offer Retry during an active run even if an error event arrives", () => {
    reportConciergeError();
    const view = mount();
    expect(view.querySelector('[data-testid="concierge-stop"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="concierge-error-notice"]')).toBeNull();
  });

  it("hides and clears a failure from another conversation", () => {
    mocks.loading = false;
    mocks.thread = "thread-b";
    reportConciergeError("thread-a");
    const view = mount();
    expect(view.querySelector('[data-testid="concierge-error-notice"]')).toBeNull();
    expect(view.textContent).toBe("");
  });

  it("uses the failed operation's retry instead of the generic agent retry", () => {
    mocks.loading = false;
    const retryOperation = vi.fn();
    reportConciergeError({ threadId: "thread-a", retry: retryOperation });
    const view = mount();
    act(() => {
      Array.from(view.querySelectorAll("button"))
        .find((button) => button.textContent === "Try again ↻")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(retryOperation).toHaveBeenCalledTimes(1);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("renders nothing when idle", () => {
    mocks.loading = false;
    const view = mount();
    expect(view.textContent).toBe("");
  });
});
