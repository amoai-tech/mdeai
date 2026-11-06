// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/**
 * Changing a filter must reset the *rows*, never remount the shared Ask composer.
 *
 * A signed-in visitor types into that composer and its draft lives in the component instance, so a
 * remount is silent data loss. This pins the instance identity across a neighbourhood and a cuisine
 * change.
 *
 * The real `DiscoveryWorkspace` is rendered on purpose: it is the layer that owns the composer's
 * position, so a test that stubs it could not see a remount caused there (for example a changed key
 * inside the workspace). Only the map pieces, which need live Google Maps, are stubbed.
 */
const mounts = { count: 0 };

vi.mock("@/hooks/use-is-lg-up", () => ({ useIsLgUp: () => true }));
vi.mock("@/components/browse/BrowseMapSheet", () => ({ BrowseMapSheet: () => <i /> }));
vi.mock("@/components/browse/BrowseMapPanel", () => ({ BrowseMapPanel: () => <div /> }));
vi.mock("@/components/chat/discovery-page-context", () => ({ DiscoveryPageContext: () => <i /> }));
// Leaf only: it would build a Supabase client just to render a sign-in link.
vi.mock("@/components/auth/auth-status", () => ({ AuthStatus: () => <i /> }));
vi.mock("@/components/chat/discovery-ask-composer", () => ({
  DiscoveryAskComposer: () => {
    // Count real mounts. Re-renders keep the same instance state, which is the whole point.
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return <i data-testid="ask-composer" />;
  },
}));

import { RestaurantBrowseView } from "@/components/restaurants/restaurant-browse-view";

const A = {
  id: "a",
  name: "Alpha Kitchen",
  cuisine: "colombian",
  neighborhood: "Laureles",
  priceTier: "$$",
  rating: 4.5,
  aiSummary: "summary",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=alpha",
  latitude: 6.24,
  longitude: -75.59,
} as Restaurant;

beforeEach(() => {
  mounts.count = 0;
});
afterEach(cleanup);

describe("the Ask composer survives filter changes", () => {
  it("keeps one instance across neighbourhood and cuisine changes", () => {
    const { rerender } = render(
      <RestaurantBrowseView results={[A]} error={null} neighborhood={null} cuisine={null} />,
    );
    expect(mounts.count).toBe(1);

    rerender(<RestaurantBrowseView results={[A]} error={null} neighborhood="Laureles" cuisine={null} />);
    rerender(<RestaurantBrowseView results={[A]} error={null} neighborhood="Laureles" cuisine="seafood" />);

    // Same instance, so an unsent draft typed before the filter change is still there.
    expect(mounts.count).toBe(1);
  });
});
