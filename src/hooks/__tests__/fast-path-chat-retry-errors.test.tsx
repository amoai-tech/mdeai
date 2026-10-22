// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useEventSearchFastPath } from "@/hooks/use-event-search-fast-path";
import { useRestaurantSearchFastPath } from "@/hooks/use-restaurant-search-fast-path";
import { useGroundedSearchFastPath } from "@/hooks/use-grounded-search-fast-path";

const mocks = vi.hoisted(() => ({
  setToolResult: vi.fn(),
  clearLocalMessages: vi.fn(),
  showExchange: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ state: {}, setState: mocks.setState }),
}));
vi.mock("@/components/chat/event-local-chat-context", () => ({
  useEventLocalChat: () => ({
    clarifyPending: false,
    clarifyKind: null,
    showClarify: vi.fn(),
    showExchange: mocks.showExchange,
    clearLocalMessages: mocks.clearLocalMessages,
  }),
}));
vi.mock("@/components/chat/event-fast-path-context", () => ({
  useEventFastPath: () => ({ setToolResult: mocks.setToolResult }),
}));
vi.mock("@/components/chat/restaurant-fast-path-context", () => ({
  useRestaurantFastPath: () => ({ setToolResult: mocks.setToolResult }),
}));
vi.mock("@/components/chat/grounded-fast-path-context", () => ({
  useGroundedFastPath: () => ({ setToolResult: mocks.setToolResult }),
}));
vi.mock("@/components/chat/event-search-results-context", () => ({
  useEventSearchResults: () => ({ setRows: vi.fn(), setWebCitations: vi.fn() }),
}));
vi.mock("@/hooks/use-clear-other-fast-path-results", () => ({
  useClearOtherFastPathResults: () => vi.fn(),
}));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ mergePinsByCategory: vi.fn(), requestFitBounds: vi.fn() }),
}));
vi.mock("@/lib/intelligence-telemetry", () => ({ logRoutingDecision: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let element: HTMLDivElement | null = null;

function renderHook<T>(useHook: () => T): T {
  let value: T | undefined;
  function Host() {
    value = useHook();
    return null;
  }
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
  act(() => root?.render(<Host />));
  if (!value) throw new Error("hook not mounted");
  return value;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.setToolResult.mockClear();
  mocks.clearLocalMessages.mockClear();
  mocks.showExchange.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  element?.remove();
  element = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chat fast-path failures reach operation-specific Retry", () => {
  it("surfaces a failing event search instead of silently falling through to the agent", async () => {
    const hook = renderHook(useEventSearchFastPath);
    await act(async () => {
      await expect(hook.handleUserMessage("salsa events this weekend")).rejects.toThrow("event search failed: 503");
    });
    expect(mocks.setToolResult).toHaveBeenCalledWith(null);
    expect(mocks.showExchange).not.toHaveBeenCalled();
  });

  it("surfaces a failing restaurant search instead of silently falling through to the agent", async () => {
    const hook = renderHook(useRestaurantSearchFastPath);
    await act(async () => {
      await expect(hook.handleUserMessage("fine dining modern poblado")).rejects.toThrow("restaurant search failed: 503");
    });
    expect(mocks.setToolResult).toHaveBeenCalledWith(null);
    expect(mocks.showExchange).not.toHaveBeenCalled();
  });

  it("surfaces a failing café search instead of silently falling through to the agent", async () => {
    const hook = renderHook(useGroundedSearchFastPath);
    await act(async () => {
      await expect(hook.handleUserMessage("good specialty coffee in Laureles")).rejects.toThrow("grounded search failed: 503");
    });
    expect(mocks.setToolResult).toHaveBeenCalledWith(null);
    expect(mocks.showExchange).not.toHaveBeenCalled();
  });

  it("keeps event filter-chip failures non-throwing", async () => {
    const hook = renderHook(useEventSearchFastPath);
    await act(async () => {
      await expect(hook.handleEventChip({ eventShowAll: true } as Parameters<typeof hook.handleEventChip>[0], "all events")).resolves.toBe(false);
    });
  });

  it("keeps restaurant filter-chip failures non-throwing", async () => {
    const hook = renderHook(useRestaurantSearchFastPath);
    await act(async () => {
      await expect(hook.handleRestaurantChip({ id: "test", label: "Italian", group: "cuisine", cuisine: "Italian" } as Parameters<typeof hook.handleRestaurantChip>[0])).resolves.toMatchObject({ handled: false });
    });
  });
});
