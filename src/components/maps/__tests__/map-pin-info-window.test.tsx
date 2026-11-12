// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MapPin } from "@/platform/contracts";

const actions = vi.hoisted(() => ({
  setSelectedPinId: vi.fn(),
  clearFocusPinRequest: vi.fn(),
}));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => actions,
}));

vi.mock("@vis.gl/react-google-maps", () => ({
  InfoWindow: ({ children }: { children: ReactNode }) => (
    <div data-testid="google-info-window">{children}</div>
  ),
}));

vi.mock("@/app/trips/actions", () => ({
  listTripOptions: vi.fn(async () => ({ ok: true, trips: [] })),
  addTripItem: vi.fn(async () => ({ ok: false, error: "not configured in this test" })),
}));

import { MapPinInfoWindow } from "../MapPinInfoWindow";

const pin: MapPin = {
  id: "grounded-1",
  category: "grounded",
  lat: 6.25,
  lng: -75.59,
  title: "Café A",
  source: "grounding",
};

describe("MapPinInfoWindow dismissal", () => {
  it("closes the selected place and clears the pending focus request", () => {
    actions.setSelectedPinId.mockClear();
    actions.clearFocusPinRequest.mockClear();
    const { getByRole, unmount } = render(<MapPinInfoWindow pin={pin} />);

    fireEvent.click(getByRole("button", { name: "Close selected place" }));
    expect(actions.setSelectedPinId).toHaveBeenCalledExactlyOnceWith(null);
    expect(actions.clearFocusPinRequest).toHaveBeenCalledOnce();
    unmount();
  });
});
