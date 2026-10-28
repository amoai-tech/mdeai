// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const context = {
  selectedPinId: null as string | null,
  setSelectedPinId: vi.fn(),
  panToPin: vi.fn(),
};

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => context,
}));

import { useMapPinSelect } from "@/hooks/use-map-pin-select";

describe("useMapPinSelect", () => {
  beforeEach(() => {
    context.selectedPinId = null;
    context.setSelectedPinId = vi.fn();
    context.panToPin = vi.fn();
  });

  it("pans to a newly selected pin", () => {
    const { result } = renderHook(() => useMapPinSelect());
    act(() => result.current("venue-a"));
    expect(context.panToPin).toHaveBeenCalledWith("venue-a");
    expect(context.setSelectedPinId).not.toHaveBeenCalled();
  });

  it("clears instead of panning when the selected pin is clicked again", () => {
    context.selectedPinId = "venue-a";
    const { result } = renderHook(() => useMapPinSelect());
    act(() => result.current("venue-a"));
    expect(context.setSelectedPinId).toHaveBeenCalledWith(null);
    expect(context.panToPin).not.toHaveBeenCalled();
  });

  it("moves the selection to a different pin", () => {
    context.selectedPinId = "venue-a";
    const { result } = renderHook(() => useMapPinSelect());
    act(() => result.current("venue-b"));
    expect(context.panToPin).toHaveBeenCalledWith("venue-b");
  });
});
