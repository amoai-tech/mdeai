import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventBrowseCard } from "@/components/events/event-browse-card";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";

const event: PublishedEventListItem = {
  id: "evt-1",
  eventId: "evt-1",
  slug: "salsa-night-laureles",
  title: "Salsa Night",
  venue: "Club Social",
  neighborhood: "Laureles",
  startsAt: "2026-06-13T03:00:00+00:00",
  pricePerTicket: 25,
  canBuyTickets: true,
  currency: "USD",
  ticketUrl: "https://example.com/tickets",
  category: "music",
  status: "published",
};

describe("EventBrowseCard", () => {
  it("renders Medellín-local event times regardless of the machine timezone", () => {
    const html = renderToStaticMarkup(
      <EventBrowseCard event={{ ...event, startsAt: "2026-10-19T21:00:00.000Z" }} />,
    );
    expect(html).toContain("Mon, Oct 19, 4:00 PM");
  });

  it("renders nova cover shell for browse grid", () => {
    const html = renderToStaticMarkup(
      <EventBrowseCard
        event={event}
        composition="nova"
        mediaLayout="cover"
      />,
    );
    expect(html).toContain('data-testid="event-card"');
    expect(html).toContain('data-result-kind="event"');
    expect(html).toContain("aspect-[16/10]");
    expect(html).toContain('data-testid="event-browse-card-photo-placeholder"');
    expect(html).toContain('data-testid="event-details-cta"');
    expect(html).toContain('data-testid="event-buy-cta"');
    expect(html).toContain("/events/salsa-night-laureles");
    const heroIndex = html.indexOf(
      'data-testid="event-browse-card-photo-placeholder"',
    );
    const headingIndex = html.indexOf("<h3");
    expect(heroIndex).toBeLessThan(headingIndex);
  });

  it("renders a compact inline media card while preserving real ticket actions", () => {
    const html = renderToStaticMarkup(<EventBrowseCard event={event} mediaLayout="inline" />);
    expect(html).toContain('data-testid="event-details-cta"');
    expect(html).toContain('data-testid="event-buy-cta"');
    expect(html).toContain('w-24');
    expect(html).not.toContain('px-3 pt-3');
  });

  it("never claims Free or Buy tickets when no active tier exists", () => {
    const html = renderToStaticMarkup(
      <EventBrowseCard event={{ ...event, pricePerTicket: null, canBuyTickets: false }} />,
    );
    expect(html).toContain("See tickets");
    expect(html).not.toContain(">Free<");
    expect(html).not.toContain('data-testid="event-buy-cta"');
    expect(html).toContain('data-testid="event-details-cta"');
  });

  it("offers an explicit, accessible Ask selection without replacing event Details or tickets", () => {
    const html = renderToStaticMarkup(<EventBrowseCard event={event} selectedForAsk onAskSelect={() => {}} />);
    expect(html).toContain('data-testid="event-ask-select"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Clear selection');
    expect(html).toContain('data-testid="event-details-cta"');
    expect(html).toContain('data-testid="event-buy-cta"');
  });

  it("uses a real COP tier price instead of the event summary currency", () => {
    const html = renderToStaticMarkup(
      <EventBrowseCard event={{ ...event, pricePerTicket: 40000, currency: "COP" }} />,
    );
    expect(html).toContain("From $40,000 COP");
  });

  it("renders image hero when imageUrl is set", () => {
    const html = renderToStaticMarkup(
      <EventBrowseCard
        event={{ ...event, imageUrl: "https://cdn.example.com/event.jpg" }}
        composition="nova"
        mediaLayout="cover"
      />,
    );
    expect(html).toContain('data-testid="event-browse-card-photo"');
    expect(html).toContain("https://cdn.example.com/event.jpg");
    expect(html).toContain('alt="Salsa Night"');
  });

  it("leads with the Medellín-local date, then title, venue and the real price", () => {
    const html = renderToStaticMarkup(<EventBrowseCard event={{ ...event, startsAt: "2026-10-19T21:00:00.000Z" }} />);
    const at = (needle: string) => html.indexOf(needle);
    expect(at("Mon, Oct 19, 4:00 PM")).toBeGreaterThan(-1);
    expect(at("Mon, Oct 19, 4:00 PM")).toBeLessThan(at("<h3"));
    expect(at("<h3")).toBeLessThan(at("Club Social"));
    expect(at("Club Social")).toBeLessThan(at('data-testid="event-price-label"'));
    expect(html).toContain("Laureles");
  });

  it("offers View on map and the shared pin id only when the event has a real pin", () => {
    const withPin = renderToStaticMarkup(
      <EventBrowseCard event={event} pinId="event-evt-1" selectedForMap onMapSelect={() => {}} />,
    );
    expect(withPin).toContain('data-pin-id="event-evt-1"');
    expect(withPin).toContain('data-testid="event-map-select"');
    expect(withPin).toContain("Selected on map");
    const without = renderToStaticMarkup(<EventBrowseCard event={event} />);
    expect(without).not.toContain("event-map-select");
    expect(without).not.toContain("data-pin-id");
  });
});
