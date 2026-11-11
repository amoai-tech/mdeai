import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarDays, Coffee } from "lucide-react";
import { VenueCardPlaceholder, venueCardMediaFrame } from "@/components/browse/venue-card-placeholder";
import { EventBrowseCard } from "@/components/events/event-browse-card";

/**
 * One owner for the card media frame.
 *
 * A photo, a date badge and an initials tile are three different *contents* in one frame. They
 * used to be two definitions, which is how a photo-less card drifts from the rest of the family
 * whenever the radius or aspect ratio changes. These tests fail if a caller starts hand-rolling it.
 */
const FRAME = ["relative", "overflow-hidden", "rounded-xl", "aspect-[16/10]"];

describe("card media frame has a single owner", () => {
  it("puts the shared frame on the placeholder in both layouts", () => {
    for (const layout of ["cover", "inline"] as const) {
      const html = renderToStaticMarkup(
        <VenueCardPlaceholder label="Café" icon={<Coffee />} mediaLayout={layout} testId="ph" />,
      );
      for (const token of FRAME) expect(html).toContain(token);
      expect(html).toContain(layout === "cover" ? "w-full" : "w-24");
    }
  });

  it("renders the same frame for a date badge as for a glyph", () => {
    const glyph = renderToStaticMarkup(<VenueCardPlaceholder label="Event" icon={<CalendarDays />} testId="a" />);
    const badge = renderToStaticMarkup(
      <VenueCardPlaceholder label="Event" icon={<CalendarDays />} testId="b" content={<span>DEC</span>} />,
    );
    for (const token of FRAME) {
      expect(glyph).toContain(token);
      expect(badge).toContain(token);
    }
    // The frame classes are identical; only the middle content differs.
    const framePrefix = (html: string) => html.slice(html.indexOf('<div class="'), html.indexOf('" style='));
    expect(framePrefix(glyph)).toBe(framePrefix(badge));
  });

  it("uses that frame for a real photo too, so photo and placeholder cannot drift", () => {
    const card = renderToStaticMarkup(
      <EventBrowseCard
        event={{
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
          imageUrl: "https://example.com/poster.jpg",
        }}
      />,
    );
    expect(card).toContain('data-testid="event-browse-card-photo"');
    for (const token of FRAME) expect(card).toContain(token);
    // The frame lives in exactly one place.
    expect(venueCardMediaFrame("cover")).toContain("aspect-[16/10]");
    expect(venueCardMediaFrame("inline")).toContain("w-24");
  });
});
