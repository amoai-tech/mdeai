// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/**
 * Guest catalog search must not be credited to the concierge, and its result summary must not
 * outlive the filters that produced it.
 *
 * The Ask composer is mocked down to the one prop under test (`guestRestaurants.onResults`), and
 * it counts its own mounts: a filter change has to remount it, because the summary it renders
 * belongs to a result set that the filter has already replaced.
 */
const mounts = { count: 0 };
let emit: ((rows: Restaurant[]) => void) | null = null;

vi.mock("@/hooks/use-is-lg-up", () => ({ useIsLgUp: () => true }));
vi.mock("@/components/browse/DiscoveryWorkspace", () => ({
  DiscoveryWorkspace: (p: {
    subtitle?: string;
    rightPanel?: unknown;
    askComposer?: unknown;
    children: unknown;
  }) => (
    <div>
      <h1>{p.subtitle as never}</h1>
      {p.askComposer as never}
      {p.rightPanel as never}
      {p.children as never}
    </div>
  ),
}));
vi.mock("@/components/browse/BrowseMapSheet", () => ({ BrowseMapSheet: () => <i /> }));
vi.mock("@/components/browse/BrowseMapPanel", () => ({ BrowseMapPanel: () => <div /> }));
vi.mock("@/components/chat/discovery-page-context", () => ({
  DiscoveryPageContext: () => <i data-testid="ask-context" />,
}));
vi.mock("@/components/chat/discovery-ask-composer", () => ({
  DiscoveryAskComposer: (props: {
    guestRestaurants?: { onResults: (rows: Restaurant[]) => void };
  }) => {
    // Count real mounts, not re-renders: a filter change must create a new instance.
    useEffect(() => {
      mounts.count += 1;
    }, []);
    emit = props.guestRestaurants?.onResults ?? null;
    return <i data-testid="ask-composer" />;
  },
}));

import { RestaurantBrowseView } from "@/components/restaurants/restaurant-browse-view";

const make = (id: string, name: string): Restaurant => ({
  id,
  name,
  cuisine: "colombian",
  neighborhood: "Laureles",
  priceTier: "$$",
  rating: 4.5,
  aiSummary: `${name} summary`,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
  latitude: 6.24,
  longitude: -75.59,
} as Restaurant);

const A = make("a", "Alpha Kitchen");

/** The subtitle is the only place that tells a visitor who produced these rows. */
const subtitle = () => screen.getByText(/in Medellín|Search results|Ask MDE/).textContent ?? "";
const renderView = (cuisine: string | null = null) =>
  render(
    <RestaurantBrowseView results={[A]} error={null} neighborhood={null} cuisine={cuisine} />,
  );

beforeEach(() => {
  mounts.count = 0;
  emit = null;
});

afterEach(cleanup);

describe("guest catalog search stays honest", () => {
  it("does not credit the concierge for catalog results", () => {
    renderView();
    expect(subtitle()).toContain("Food & dining in Medellín");

    act(() => emit?.([A]));
    expect(subtitle()).toContain("Search results — 1 restaurants");
    expect(subtitle()).not.toContain("Ask MDE");
  });

  it("remounts the composer when the filters change, so an old summary cannot survive", () => {
    const { rerender } = renderView(null);
    expect(mounts.count).toBe(1);

    act(() => emit?.([A]));
    expect(subtitle()).toContain("Search results");

    // A filter change replaces the rows, so the composer that described them must not persist.
    rerender(<RestaurantBrowseView results={[A]} error={null} neighborhood={null} cuisine="seafood" />);
    expect(mounts.count).toBe(2);
    expect(subtitle()).toContain("Food & dining in Medellín");
    expect(subtitle()).not.toContain("Search results");
  });
});
