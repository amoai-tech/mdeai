// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConciergeWorkingMemory } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  state: {} as ConciergeWorkingMemory,
  send: vi.fn(),
  notice: vi.fn(),
}));

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({
    state: mocks.state,
    setState: (
      patch: Partial<ConciergeWorkingMemory> | ((s: ConciergeWorkingMemory) => ConciergeWorkingMemory),
    ) => {
      mocks.state = typeof patch === "function" ? patch(mocks.state) : { ...mocks.state, ...patch };
    },
  }),
}));
vi.mock("@/components/chat/event-local-chat-context", () => ({
  useEventLocalChat: () => ({ showNotice: mocks.notice }),
}));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({ appendMessage: vi.fn(), isLoading: false }),
}));
vi.mock("@/hooks/use-event-search-fast-path", () => ({
  useEventSearchFastPath: () => ({ handleEventChip: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({
  useConciergeSendHandlers: () => ({ handleRentalMessage: vi.fn() }),
}));
vi.mock("@/lib/concierge-send-user-message", () => ({
  sendConciergeUserMessage: mocks.send,
}));
vi.mock("@/lib/concierge-error-store", () => ({
  clearConciergeError: vi.fn(),
}));

import { ChatQueryBar } from "@/components/chat/chat-query-bar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let node: HTMLDivElement;

beforeEach(() => {
  mocks.send.mockReset();
  mocks.notice.mockReset();
  mocks.state = {};
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
  act(() => root.render(React.createElement(ChatQueryBar)));
});

afterEach(() => {
  act(() => root.unmount());
  node.remove();
  vi.restoreAllMocks();
});

describe("monthly COP chip click", () => {
  it("uses the existing sender with the exact monthly COP request", async () => {
    mocks.send.mockResolvedValueOnce(true);
    const chip = node.querySelector<HTMLButtonElement>('[data-testid="filter-chip-under-4m"]');
    expect(chip?.textContent).toBe("Under COP 4M/month");
    await act(async () => { chip?.click(); });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0]).toBe("Find rental apartments under COP 4,000,000/month");
    expect(mocks.state.lastRentalQuery?.maxPriceMonthly).toBe(4_000_000);
    expect(mocks.state.lastRentalQuery?.maxPricePerNight).toBeUndefined();
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
  });

  it("reverts a rejected send and explains how the renter can retry", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockRejectedValueOnce(new Error("offline"));
    const chip = node.querySelector<HTMLButtonElement>('[data-testid="filter-chip-under-4m"]');
    await act(async () => { chip?.click(); });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(chip?.getAttribute("aria-pressed")).toBe("false");
    expect(mocks.state.lastRentalQuery?.maxPriceMonthly).toBeUndefined();
    expect(mocks.notice).toHaveBeenCalledWith(expect.stringMatching(/Tap the budget again to retry/i));
    expect(errorSpy).toHaveBeenCalled();
  });

  it("reverts a send explicitly declined by the dispatcher", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockResolvedValueOnce(false);
    const chip = node.querySelector<HTMLButtonElement>('[data-testid="filter-chip-under-4m"]');
    await act(async () => { chip?.click(); });

    expect(chip?.getAttribute("aria-pressed")).toBe("false");
    expect(mocks.state.lastRentalQuery?.maxPriceMonthly).toBeUndefined();
    expect(mocks.notice).toHaveBeenCalledTimes(1);
  });
});
