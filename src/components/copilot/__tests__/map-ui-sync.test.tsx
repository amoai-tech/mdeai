// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MapUiSync } from "../map-ui-sync";

const h = vi.hoisted(() => ({
  current: {
    pins: [{ id: "rental-A", category: "rental" as const }],
    selectedPinId: "rental-A" as string | null,
    viewport: { lat: 6.24, lng: -75.58, zoom: 13 },
  },
  setState: vi.fn(),
}));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => h.current,
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ setState: h.setState, isReady: true }),
}));

function lastMapUi() {
  const call = h.setState.mock.calls.at(-1)?.[0];
  return typeof call === "function" ? call({}).mapUi : call?.mapUi;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MapUiSync", () => {
  it("publishes a new selection immediately, before the camera debounce", async () => {
    const { rerender } = render(<MapUiSync />);
    await waitFor(() => expect(lastMapUi()?.selectedPinId).toBe("rental-A"));

    h.setState.mockClear();
    h.current = {
      ...h.current,
      pins: [
        { id: "rental-A", category: "rental" },
        { id: "rental-B", category: "rental" },
      ],
      selectedPinId: "rental-B",
    };
    rerender(<MapUiSync />);

    expect(lastMapUi()?.selectedPinId).toBe("rental-B");
  });

  it("still debounces viewport-only updates by 300 ms", () => {
    vi.useFakeTimers();
    const { rerender } = render(<MapUiSync />);
    act(() => vi.runOnlyPendingTimers());
    h.setState.mockClear();

    h.current = {
      ...h.current,
      viewport: { lat: 6.3, lng: -75.6, zoom: 14 },
    };
    rerender(<MapUiSync />);
    expect(h.setState).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(299));
    expect(h.setState).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(lastMapUi()?.viewport).toEqual({ lat: 6.3, lng: -75.6, zoom: 14 });
  });
});
