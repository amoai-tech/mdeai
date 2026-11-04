import { formatEventSchedule, formatTicketPrice, ticketsRemaining } from "@/lib/events/format-event";
import type { PublicEventDetail } from "@/lib/events/types";
import { buildListedAreaMapUrl, buildVenueDirectionsUrl } from "@/lib/events/event-map-links";

/** Match only the event-detail CTA contract, not arbitrary chat messages containing UUIDs. */
export function eventIdFromDetailAsk(text: string): string | null {
  const match = /^Help me with this MDE event\s*\(event ID:\s*([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\):/i.exec(text.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/** Ground a guest's event-specific answer in the existing public server projection.
 * No LLM or direct client database access is required, and no booking is claimed. */
export function summarizePublicEventForChat(event: PublicEventDetail): string {
  const venue = [event.venue?.name, event.venue?.address ?? event.address, event.venue?.city ?? event.city]
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
    .join(" · ") || "Venue not yet published";

  const available = event.tickets.filter((tier) => ticketsRemaining(tier.qtyTotal, tier.qtySold) > 0);
  const ticketStatus = event.tickets.length === 0
    ? "Price TBD — no ticket tiers have been published; do not assume tickets are on sale."
    : available.length === 0
      ? "Sold out — no tickets are available."
      : available.map((tier) => `${tier.name}: ${formatTicketPrice(tier.priceCents, tier.currency)}`).join("; ");

  const sourceStatus = event.source === "manual"
    ? "Source: manually entered listing. MDE has not independently verified an organizer announcement for this event."
    : "Source: public event listing. Verify event-specific dates and instructions with its organizer.";

  // Reuse the same map contract as the event detail screen.
  // A listed street without a linked venue cannot be treated as an exact destination.
  const locationUrl = event.venue
    ? buildVenueDirectionsUrl(event.venue.address, event.latitude, event.longitude)
    : buildListedAreaMapUrl(event.address || event.city);
  const locationLabel = event.venue
    ? "Directions"
    : "Listed area (exact meeting point not confirmed)";

  return [
    `Event: ${event.name}`,
    `When: ${formatEventSchedule(event.startsAt, event.endsAt)} (Colombia time; listing schedule)`,
    `Where: ${venue}`,
    `Tickets: ${ticketStatus}`,
    event.host?.name ? `Hosted by: ${event.host.name}` : null,
    sourceStatus,
    event.description ? `About: ${event.description}` : null,
    locationUrl ? `${locationLabel}: ${locationUrl}` : null,
    `Event details: /events/${event.slug ?? event.id}`,
  ].filter(Boolean).join("\n\n");
}
