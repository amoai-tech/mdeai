// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
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
});
