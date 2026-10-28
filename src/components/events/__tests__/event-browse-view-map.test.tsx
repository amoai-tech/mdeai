import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";

// The view's shell pulls in auth, nav and Ask MDE; only the map decision is under test here.
vi.mock("@/components/browse/DiscoveryWorkspace", () => ({
  DiscoveryWorkspace: (p: { rightPanel?: unknown; mobileMapTrigger?: unknown; children: unknown }) => (
    <div data-has-map={p.rightPanel ? "true" : "false"} data-has-trigger={p.mobileMapTrigger ? "true" : "false"}>{p.children as never}</div>
  ),
}));
vi.mock("@/components/browse/BrowseMapPanel", () => ({ BrowseMapPanel: () => <i /> }));
vi.mock("@/components/browse/BrowseMapSheet", () => ({ BrowseMapSheet: () => <i /> }));
vi.mock("@/components/chat/discovery-ask-composer", () => ({ DiscoveryAskComposer: () => <i /> }));
vi.mock("@/components/chat/discovery-page-context", () => ({ DiscoveryPageContext: () => null }));
vi.mock("@/hooks/use-browse-map-sync", () => ({ useBrowseMapSync: () => {} }));

import { EventBrowseView } from "@/components/events/event-browse-view";

const base: PublishedEventListItem = {
  id: "a", eventId: "a", slug: "a", title: "Located", venue: "Calle 10", neighborhood: "El Poblado",
  startsAt: "2027-02-24T01:00:00+00:00", pricePerTicket: null, canBuyTickets: false, currency: "COP",
  ticketUrl: "/events/a", category: "culture", status: "published", latitude: 6.21, longitude: -75.56,
};
const props = { total: 2, error: null, category: null, neighborhood: null, dateWindow: null, price: null };

describe("EventBrowseView map", () => {
  it("shows the map and pins only the located card; the unlocated event stays a visible card", () => {
    const html = renderToStaticMarkup(
      <EventBrowseView {...props} results={[base, { ...base, id: "b", eventId: "b", slug: "b", title: "No location", latitude: undefined, longitude: undefined }]} />,
    );
    expect(html).toContain('data-has-map="true"');
    expect(html).toContain('data-has-trigger="true"');
    expect(html).toContain("Located");
    expect(html).toContain("No location");
    expect(html.match(/data-pin-id=/g)).toHaveLength(1);
    expect(html).toContain('data-pin-id="event-a"');
  });

  it("shows no map at all when no event has a saved position, and the cards stay in the wider feed", () => {
    const html = renderToStaticMarkup(
      <EventBrowseView {...props} results={[{ ...base, latitude: undefined, longitude: undefined }]} />,
    );
    expect(html).toContain('data-has-map="false"');
    expect(html).toContain("@3xl:grid-cols-2");
    expect(html).not.toContain("data-pin-id");
  });

  it("shows no map when the catalog failed to load", () => {
    const html = renderToStaticMarkup(<EventBrowseView {...props} results={[base]} error="Could not load events." />);
    expect(html).toContain('data-has-map="false"');
  });
});
