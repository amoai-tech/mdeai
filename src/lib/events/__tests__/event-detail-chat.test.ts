import { describe, expect, it } from "vitest";
import { eventIdFromDetailAsk, summarizePublicEventForChat } from "../event-detail-chat";
import type { PublicEventDetail } from "../types";

const event: PublicEventDetail = {
  id: "a1b2c3d4-0001-0001-0001-000000000003",
  slug: null,
  name: "Feria preview",
  description: "December preview not confirmed by an organizer.",
  address: "Avenida El Poblado, Medellín",
  city: "Medellín",
  startsAt: "2026-12-06T14:00:00Z",
  endsAt: "2026-12-06T18:00:00Z",
  imageUrl: null,
  source: "manual",
  currency: "COP",
  latitude: 6.2,
  longitude: -75.5,
  host: null,
  venue: null,
  tickets: [],
};

describe("SAN-1600 grounded event detail chat for guests", () => {
  it("accepts only the canonical detail CTA with a UUID", () => {
    expect(eventIdFromDetailAsk(`Help me with this MDE event (event ID: ${event.id}): Feria preview.`)).toBe(event.id);
    expect(eventIdFromDetailAsk(`find any events near ${event.id}`)).toBeNull();
    expect(eventIdFromDetailAsk("Help me with this MDE event (event ID: bogus): Fake.")).toBeNull();
  });

  it("reads the actual date and address, never invents tickets or organizer confirmation", () => {
    const text = summarizePublicEventForChat(event);
    expect(text).toContain("Feria preview");
    expect(text).toContain("Dec 6");
    expect(text).toContain("Colombia time");
    expect(text).toContain("Avenida El Poblado");
    expect(text).toContain("Price TBD");
    expect(text).toContain("no ticket tiers have been published");
    expect(text).toContain("not independently verified");
    expect(text).toContain("December preview not confirmed");
    expect(text).toContain("Listed area (exact meeting point not confirmed)");
    expect(text).toContain("https://www.google.com/maps/search/?api=1&query=Avenida");
    expect(text).not.toContain("https://www.google.com/maps/dir/?");
    expect(text).toContain(`/events/${event.id}`);
    expect(text).not.toContain("Buy tickets");
    expect(text).not.toContain("Registration confirmed");
  });

  it("formats real available tier prices and sold-out status using quantity fields", () => {
    const ticket = { id: "vip", name: "VIP", priceCents: 12000000,
      currency: "COP", qtyTotal: 10, qtySold: 2, position: 0 };
    const priced = summarizePublicEventForChat({ ...event, tickets: [ticket] });
    expect(priced).toContain("VIP: $120,000 COP");
    expect(priced).not.toContain("Price TBD");
    const soldout = summarizePublicEventForChat({ ...event, tickets: [{ ...ticket, qtySold: 10 }] });
    expect(soldout).toContain("Sold out");
    expect(soldout).not.toContain("VIP: $120,000 COP");
  });

  it("keeps exact directions for a linked, saved venue", () => {
    const answer = summarizePublicEventForChat({ ...event, venue: {
      name: "Hotel Intercontinental", address: "Calle 16 #28-51", city: "Medellín",
    } });
    expect(answer).toContain("Directions: https://www.google.com/maps/dir/?api=1&destination=Calle");
    expect(answer).not.toContain("Listed area (exact meeting point not confirmed)");
    expect(answer).not.toContain("/maps/search/?");
  });

  it("does not imply an unknown venue is a known address", () => {
    const text = summarizePublicEventForChat({ ...event, address: null, city: null, venue: null });
    expect(text).toContain("Venue not yet published");
    expect(text).not.toContain("https://www.google.com/maps/dir");
  });
});
