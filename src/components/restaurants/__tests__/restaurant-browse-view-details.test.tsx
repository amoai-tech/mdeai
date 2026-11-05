// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/**
 * Two focused regressions for the restaurant Details panel (SAN-1638).
 *
 * Both came from mirroring the selected map pin into extra state during render:
 *  1. clicking Details for A while pin B was selected opened B (the mirror re-ran after the
 *     click and overwrote the record the click had just opened);
 *  2. after Close, choosing the same pin again did nothing, because the mirror still held it.
 *
 * The panel is driven by `pinRestaurantId ?? detailsId` with no mirror, so both sequences must
 * pass without touching the wider browse behaviour.
 */
vi.mock("@/hooks/use-is-lg-up", () => ({ useIsLgUp: () => true }));
vi.mock("@/components/browse/DiscoveryWorkspace", () => ({
  DiscoveryWorkspace: (p: { rightPanel?: unknown; askComposer?: unknown; children: unknown }) => (
    <div>
      {p.askComposer as never}
      {p.rightPanel as never}
      {p.children as never}
    </div>
  ),
}));
vi.mock("@/components/browse/BrowseMapSheet", () => ({ BrowseMapSheet: () => <i /> }));
// Stand-in map: markers drive the real shared map context, which is what the panel follows.
vi.mock("@/components/browse/BrowseMapPanel", async () => {
  const { useMapContext } = await import("@/platform/maps/map-context");
  return {
    BrowseMapPanel: (p: { overlay?: unknown }) => {
      const { pins, selectedPinId, setSelectedPinId } = useMapContext();
      return (
        <div data-testid="map">
          {p.overlay as never}
          {pins.map((pin) => (
            <button
              key={pin.id}
              type="button"
              data-testid={`marker-${pin.id}`}
              // The real map toggles: clicking the selected marker releases it.
              onClick={() => setSelectedPinId(selectedPinId === pin.id ? null : pin.id)}
            >
              {pin.title}
            </button>
          ))}
        </div>
      );
    },
  };
});
vi.mock("@/components/chat/discovery-ask-composer", () => ({
  DiscoveryAskComposer: () => null,
}));
vi.mock("@/components/chat/discovery-page-context", () => ({
  DiscoveryPageContext: () => null,
}));

import { RestaurantBrowseView } from "@/components/restaurants/restaurant-browse-view";

const make = (id: string, name: string): Restaurant => ({
  id,
  name,
  cuisine: "colombian",
  neighborhood: "Laureles",
  vibe: [],
  imageUrl: `https://example.com/${id}.jpg`,
  sourceUrl: `https://mdeai.co/restaurants/${id}`,
  latitude: 6.25,
  longitude: -75.59,
  mapsUrl: `https://maps.google.com/?cid=${id}`,
  aiSummary: `About ${name}.`,
});

const A = make("a", "Alpha Kitchen");
const B = make("b", "Beta Kitchen");

/** Heading currently shown in the Details panel, or null when it is closed. */
const panelName = () => {
  const panel = screen.queryByTestId("restaurant-details");
  return panel ? within(panel).getByRole("heading", { level: 2 }).textContent : null;
};
/** The rendered card for one restaurant id. */
const cardFor = (id: string) => screen.getByTestId(`restaurant-card-${id}`);
/** Press the card Details action, as a visitor would. */
const openDetails = (id: string) =>
  act(() => {
    within(cardFor(id)).getByTestId(/^restaurant-details-open-/).click();
  });
/** Whether Ask MDE is pressed on that card. */
const askPressed = (id: string) =>
  within(cardFor(id)).getByTestId(/^restaurant-ask-select/).getAttribute("aria-pressed");
/** Pick that restaurant’s map marker. */
const selectPin = (id: string) =>
  act(() => {
    screen.getByTestId(`marker-restaurant-${id}`).click();
  });
/** Press the panel Close button. */
const closePanel = () =>
  act(() => {
    screen.getByTestId("restaurant-details-close").click();
  });

beforeEach(() => {
  render(<RestaurantBrowseView results={[A, B]} error={null} neighborhood={null} cuisine={null} />);
});
afterEach(() => cleanup());

describe("restaurant Details and the selected pin", () => {
  it("keeps the restaurant a Details click opened even though a different pin is selected", () => {
    selectPin("b");
    expect(panelName()).toBe("Beta Kitchen");

    // The newer, explicit action must win; the previously selected pin must not overwrite it.
    openDetails("a");
    expect(panelName()).toBe("Alpha Kitchen");
  });

  it("moves the Ask context with the panel when a map marker is picked", () => {
    openDetails("a");
    expect(askPressed("a")).toBe("true");

    selectPin("b");
    expect(panelName()).toBe("Beta Kitchen");
    // The panel moved to B, so B must be the card that looks selected for Ask MDE.
    expect(askPressed("b")).toBe("true");
    expect(askPressed("a")).toBe("false");
  });

  it("releasing a pin closes the panel instead of resurrecting the older Details record", () => {
    openDetails("a");
    expect(panelName()).toBe("Alpha Kitchen");

    selectPin("b");
    expect(panelName()).toBe("Beta Kitchen");

    // Releasing B must not fall back to the Details record that B replaced.
    selectPin("b");
    expect(screen.queryByTestId("restaurant-details")).toBeNull();
  });

  it("does not move focus to a stale card button when a pin took the panel over", async () => {
    const alphaTrigger = within(cardFor("a")).getByTestId(/^restaurant-details-open-/);
    openDetails("a");
    alphaTrigger.focus();

    // The panel now belongs to Beta, so closing must not focus Alpha's older button.
    selectPin("b");
    (document.activeElement as HTMLElement | null)?.blur();
    closePanel();
    // Close returns focus inside requestAnimationFrame.
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(document.activeElement).not.toBe(alphaTrigger);
  });

  it("closes the panel and the selections, then reopens the same pin's details", () => {
    openDetails("a");
    expect(panelName()).toBe("Alpha Kitchen");
    // Opening Details is what sets the Ask context, so Close must clear it again.
    expect(askPressed("a")).toBe("true");

    closePanel();
    expect(screen.queryByTestId("restaurant-details")).toBeNull();
    // Close must clear the Ask context too, not leave a card looking selected.
    expect(askPressed("a")).toBe("false");

    // Re-selecting the very same pin must work; no remembered pin may block it.
    selectPin("a");
    expect(panelName()).toBe("Alpha Kitchen");
  });
});
