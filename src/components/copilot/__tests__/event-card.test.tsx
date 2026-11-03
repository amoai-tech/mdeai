import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "../event-card";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** Tool JSON shape from search-events (F15). */
const toolPayload = {
  id: "evt-001",
  title: "Salsa Night at Lleras",
  venue: "Parque Lleras",
  neighborhood: "El Poblado",
  startsAt: "2026-05-23T22:00:00.000Z",
  pricePerTicket: 25,
  imageUrl: "https://example.com/salsa.jpg",
};

describe("EventCard", () => {
  it("renders fields from search-events tool JSON", () => {
    const html = renderToStaticMarkup(
      <EventCard
        id={`event-${toolPayload.id}`}
        eventId={toolPayload.id}
        title={toolPayload.title}
        venue={toolPayload.venue}
        neighborhood={toolPayload.neighborhood}
        startsAt={toolPayload.startsAt}
        pricePerTicket={toolPayload.pricePerTicket}
        canBuyTickets
        imageUrl={toolPayload.imageUrl}
        ticketUrl={`/events/${toolPayload.id}`}
      />,
    );

    expect(html).toContain('data-testid="event-card"');
    expect(html).toContain('data-result-kind="event"');
    expect(html).toContain(
      'aria-label="Event: Salsa Night at Lleras, El Poblado"',
    );
    expect(html).toContain(toolPayload.title);
    // 22:00Z is 17:00 in Medellín, independent of server/browser timezone.
    expect(html).toContain("5:00 PM");

    expect(html).toContain(toolPayload.venue);
    expect(html).toContain(toolPayload.neighborhood);
    expect(html).toContain("From $25");
    expect(html).toContain('data-testid="event-buy-cta"');
    expect(html).toContain(`href="/events/${toolPayload.id}"`);
  });

  it("does not invent free entry or Buy when tiers are absent", () => {
    const html = renderToStaticMarkup(
      <EventCard id="event-tierless" eventId="tierless" title="Informational parade"
        venue="Medellín" neighborhood="Laureles" startsAt={toolPayload.startsAt}
        pricePerTicket={null} currency="COP" canBuyTickets={false}
        ticketUrl="/events/tierless" />,
    );
    expect(html).toContain("Price TBD");
    expect(html).not.toContain("From $0");
    expect(html).not.toContain('data-testid="event-buy-cta"');
  });

  it("shows Free only for a real zero-priced tier and hides Buy when sold out", () => {
    const html = renderToStaticMarkup(
      <EventCard id="event-sold-out" eventId="sold-out" title="Sold Out"
        venue="Medellín" neighborhood="" startsAt={toolPayload.startsAt}
        pricePerTicket={0} currency="COP" canBuyTickets={false}
        ticketUrl="/events/sold-out" />,
    );
    expect(html).toContain("Free");
    expect(html).not.toContain('data-testid="event-buy-cta"');
  });

  it("Buy tickets uses button when onBuyTickets is provided (no navigation href)", () => {
    const html = renderToStaticMarkup(
      <EventCard
        id={`event-${toolPayload.id}`}
        eventId={toolPayload.id}
        title={toolPayload.title}
        venue={toolPayload.venue}
        neighborhood={toolPayload.neighborhood}
        startsAt={toolPayload.startsAt}
        pricePerTicket={toolPayload.pricePerTicket}
        canBuyTickets
        ticketUrl={`/events/${toolPayload.id}`}
        onBuyTickets={() => {}}
      />,
    );
    expect(html).toContain('data-testid="event-buy-cta"');
    expect(html).not.toContain(`href="/events/${toolPayload.id}"`);
  });
});
