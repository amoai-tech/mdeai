// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/**
 * The restaurant Details panel contract (SAN-1638).
 *
 * **Details is the only thing that opens the panel.** Selecting a pin — on the map or with the
 * card's "View on map" — moves the map selection and leaves the panel and the Ask context alone,
 * which is exactly what café and nightlife cards already did. The panel used to follow the pin,
 * which meant "View on map" opened Details over the map it had just moved.
 *
 * Ask MDE is set by opening Details and by the Ask toggle; Close clears panel, pin and Ask.
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
  DiscoveryPageContext: (p: { selectedId: string | null }) => (
    <i data-testid="ask-context" data-selected={p.selectedId ?? ""} />
  ),
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
const NOLOC: Restaurant = { ...make("c", "Gamma Kitchen"), latitude: undefined, longitude: undefined };

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
/** What the concierge is told is selected. */
const contextSelected = () => screen.getByTestId("ask-context").getAttribute("data-selected");
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

// jsdom has no layout, so the card-scroll hook's scrollIntoView is missing. The real map action
// runs the real pin-selection hook, which needs it.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  render(<RestaurantBrowseView results={[A, B, NOLOC]} error={null} neighborhood={null} cuisine={null} />);
});
afterEach(() => cleanup());

describe("restaurant Add to trip", () => {
  it("offers Add to trip for genuine restaurants even without coordinates", () => {
    expect(screen.getByTestId("restaurant-add-to-trip-a")).not.toBeNull();
    expect(screen.getByTestId("restaurant-add-to-trip-c")).not.toBeNull();
  });
});

describe("restaurant Details and the selected pin", () => {
  it("opens the panel for the card whose Details was pressed, whatever pin is selected", () => {
    selectPin("b");
    expect(panelName()).toBeNull();

    // The explicit action is the only panel opener, so it cannot be shadowed by the pin.
    openDetails("a");
    expect(panelName()).toBe("Alpha Kitchen");
  });

  it("selecting a map marker never opens the panel", () => {
    selectPin("b");
    expect(panelName()).toBeNull();
    // The pin still changes what the map shows; it just stops repointing the panel.
    expect(within(cardFor("b")).getByText("Selected on map")).toBeTruthy();
    // And it does not silently change what the concierge thinks is selected.
    expect(askPressed("b")).toBe("false");
  });

  it("keeps an open Details panel on its own record while the pin moves", () => {
    openDetails("a");
    expect(panelName()).toBe("Alpha Kitchen");

    selectPin("b");
    expect(panelName()).toBe("Alpha Kitchen");

    // Releasing the pin changes nothing about the panel either.
    selectPin("b");
    expect(panelName()).toBe("Alpha Kitchen");
  });

  it("View on map selects the pin without opening Details or changing Ask", () => {
    openDetails("b");
    expect(panelName()).toBe("Beta Kitchen");
    closePanel();
    expect(screen.queryByTestId("restaurant-details")).toBeNull();

    // The map action must do what it does on cafés and nightlife: move the map selection only.
    act(() => {
      within(cardFor("a")).getByTestId("restaurant-map-select").click();
    });
    expect(panelName()).toBeNull();
    expect(askPressed("a")).toBe("false");
    expect(within(cardFor("a")).getByText("Selected on map")).toBeTruthy();
  });

  it("keeps the concierge and the card in agreement when only the pin moves", () => {
    act(() => {
      within(cardFor("a")).getByTestId("restaurant-map-select").click();
    });

    // The pin moved, but nothing was selected for Ask — so the concierge must not be told
    // that "a" is the selected restaurant while its Ask control reads unpressed.
    expect(askPressed("a")).toBe("false");
    expect(contextSelected()).toBe("");

    // Opening Details is what selects a record for Ask, on both surfaces.
    openDetails("a");
    expect(askPressed("a")).toBe("true");
    expect(contextSelected()).toBe("a");
  });

  it("gives a restaurant with no map coordinates no map selection at all", () => {
    // `restaurantToMapPin` dropped this row, so neither the body nor the map action may
    // announce a selection the map cannot show.
    const card = cardFor("c");
    expect(within(card).queryByTestId("restaurant-map-select")).toBeNull();
    // The card body stops advertising a map selection (the shell only renders the interactive
    // role and label when a handler exists); the real links and buttons stay.
    expect(card.querySelector('[aria-label^="Select "]')).toBeNull();
    expect(card.querySelector('[aria-label="Open details for Gamma Kitchen"]')).toBeNull();
  });

  it("offers no map action for a restaurant the map cannot show", () => {
    // `restaurantToMapPin` drops rows without coordinates, so the control must not render.
    expect(within(cardFor("c")).queryByTestId("restaurant-map-select")).toBeNull();
    expect(within(cardFor("a")).getByTestId("restaurant-map-select")).toBeTruthy();
  });

  it("closes the panel and the selections, and reopening Details still works", () => {
    openDetails("a");
    expect(panelName()).toBe("Alpha Kitchen");
    // Opening Details is what sets the Ask context, so Close must clear it again.
    expect(askPressed("a")).toBe("true");

    closePanel();
    expect(screen.queryByTestId("restaurant-details")).toBeNull();
    // Close must clear the Ask context too, not leave a card looking selected.
    expect(askPressed("a")).toBe("false");

    // The same card can be opened again; nothing remembered blocks it.
    openDetails("a");
    expect(panelName()).toBe("Alpha Kitchen");
  });
});
