// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const context = {
  focusPinId: null as string | null,
  clearFocusPinRequest: vi.fn(),
};

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => context,
}));

import { useBrowseCardScroll } from "@/hooks/use-browse-card-scroll";

describe("useBrowseCardScroll", () => {
  beforeEach(() => {
    context.focusPinId = null;
    context.clearFocusPinRequest = vi.fn();
    document.body.innerHTML = "";
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("scrolls the card for the focused pin into view", () => {
    const card = document.createElement("div");
    card.setAttribute("data-pin-id", "venue-a");
    document.body.appendChild(card);
    context.focusPinId = "venue-a";

    renderHook(() => useBrowseCardScroll());

    expect(card.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
  });

  // The map controller clears the request after panning. Clearing here could drop it first and
  // stop the map from following a marker click.
  it("does not clear the focus request", () => {
    const card = document.createElement("div");
    card.setAttribute("data-pin-id", "venue-a");
    document.body.appendChild(card);
    context.focusPinId = "venue-a";

    renderHook(() => useBrowseCardScroll());

    expect(context.clearFocusPinRequest).not.toHaveBeenCalled();
  });
});
