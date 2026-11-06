// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/**
 * Changing a filter must reset the *rows*, never remount the shared Ask composer.
 *
 * A signed-in visitor types into that composer; its draft lives in the component instance, so a
 * remount is silent data loss. This pins the instance identity across a filter change — the
 * cheapest proof that "type a draft, change filters, draft survives" holds without a login.
 */
const mounts = { count: 0 };

vi.mock("@/hooks/use-is-lg-up", () => ({ useIsLgUp: () => true }));
vi.mock("@/components/browse/DiscoveryWorkspace", () => ({
  DiscoveryWorkspace: (p: { subtitle?: string; rightPanel?: unknown; askComposer?: unknown; children: unknown }) => (
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
vi.mock("@/components/chat/discovery-page-context", () => ({ DiscoveryPageContext: () => <i /> }));
vi.mock("@/components/chat/discovery-ask-composer", () => ({
  DiscoveryAskComposer: () => {
    // Count real mounts; re-renders keep the same state, and that is the whole point.
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return <i data-testid="ask-composer" />;
  },
}));

import { RestaurantBrowseView } from "@/components/restaurants/restaurant-browse-view";

// Guest-row plumbing is covered by restaurant-browse-view-search-source.test.tsx; this file
// proves instance identity only.
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

describe("filter changes never remount the Ask composer", () => {
  it("keeps one composer instance across a cuisine change", () => {
    const { rerender } = render(
      <RestaurantBrowseView results={[A]} error={null} neighborhood={null} cuisine={null} />,
    );
    expect(mounts.count).toBe(1);

    rerender(<RestaurantBrowseView results={[A]} error={null} neighborhood="Laureles" cuisine={null} />);
    rerender(<RestaurantBrowseView results={[A]} error={null} neighborhood="Laureles" cuisine="seafood" />);

    // Same instance: an unsent draft typed before the filter change is still there.
    expect(mounts.count).toBe(1);
  });

});
