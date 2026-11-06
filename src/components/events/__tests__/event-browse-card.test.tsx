// @vitest-environment jsdom
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
    // A photo-less event now shows its real date instead of the generic tile.
    expect(html).toContain('data-testid="event-browse-card-date-badge"');
    // 2026-06-13T03:00Z is still Jun 12 in Medellín (UTC-5): the badge must use local time.
    expect(html).toContain("JUN");
    expect(html).toContain(">12<");
    expect(html).toContain('data-testid="event-details-cta"');
    expect(html).toContain('data-testid="event-buy-cta"');
    expect(html).toContain("/events/salsa-night-laureles");
    const heroIndex = html.indexOf('data-testid="event-browse-card-date-badge"');
    const headingIndex = html.indexOf("<h3");
    expect(heroIndex).toBeLessThan(headingIndex);
  });

  it("uses the shared discovery action height on Ask, Details and Buy tickets", () => {
    // SAN-1122 follow-up: event actions were 28px while restaurant and venue cards were 44px.
    // The shared --spacing-card-action token is the single source. Read each element's OWN
    // class attribute: a forward slice of the markup can pick up the next element's classes
    // (the Button primitive emits `class` before `data-testid`), which would pass even if the
    // Ask button lost the token.
    const classOf = (html: string, testId: string): string | null => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return doc.querySelector(`[data-testid="${testId}"]`)?.getAttribute("class") ?? null;
    };

    const withTickets = renderToStaticMarkup(
      <EventBrowseCard event={event} onAskSelect={() => undefined} />,
    );
    for (const testId of [
      "event-ask-select",
      "event-details-cta",
      "event-buy-cta",
    ]) {
      const className = classOf(withTickets, testId);
      expect(className, `${testId} must render`).not.toBeNull();
      expect(className, `${testId} must use the card action token`).toContain(
        "h-card-action",
      );
    }

    const withoutTickets = renderToStaticMarkup(
      <EventBrowseCard
        event={{ ...event, canBuyTickets: false, pricePerTicket: null }}
        onAskSelect={() => undefined}
      />,
    );
    expect(classOf(withoutTickets, "event-ask-select")).toContain("h-card-action");
    expect(classOf(withoutTickets, "event-details-cta")).toContain("h-card-action");
    expect(classOf(withoutTickets, "event-buy-cta")).toBeNull();
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
    expect(html).toContain("Price TBD");
    expect(html).not.toContain("See tickets");
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

  it("shares one selection: the shared pin id is on the card, selecting highlights it, and there is no separate map button", () => {
    const html = renderToStaticMarkup(<EventBrowseCard event={event} pinId="event-evt-1" selectedForAsk onAskSelect={() => {}} />);
    expect(html).toContain('data-pin-id="event-evt-1"');
    expect(html).toContain('data-selected="true"');
    expect(html).not.toContain("event-map-select");
    const without = renderToStaticMarkup(<EventBrowseCard event={event} />);
    expect(without).not.toContain("data-pin-id");
    expect(without).toContain('data-selected="false"');
  });

  it("keeps one dominant action: Buy beside an outline Details when tickets are real, Details alone otherwise", () => {
    const withBuy = renderToStaticMarkup(<EventBrowseCard event={event} />);
    const detailsTag = (html: string) => html.slice(html.lastIndexOf("<a", html.indexOf('data-testid="event-details-cta"')), html.indexOf(">", html.indexOf('data-testid="event-details-cta"')));
    expect(withBuy).toContain('data-testid="event-buy-cta"');
    expect(detailsTag(withBuy)).toContain("border-border");
    const noBuy = renderToStaticMarkup(<EventBrowseCard event={{ ...event, pricePerTicket: null, canBuyTickets: false }} />);
    expect(noBuy).not.toContain('data-testid="event-buy-cta"');
    expect(detailsTag(noBuy)).not.toContain("border-border");
  });
});
