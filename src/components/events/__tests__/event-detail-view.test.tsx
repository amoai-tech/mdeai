// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventDetailView } from "@/components/events/event-detail-view";
import type { PublicEventDetail } from "@/lib/events/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/modals/booking-checkout-modal", () => ({
  BookingCheckoutModal: () => null,
}));

const baseEvent: PublicEventDetail = {
  id: "evt-audit",
  slug: "evt-audit",
  name: "Demo concert",
  description: null,
  address: null,
  city: "Medellín",
  startsAt: "2027-02-23T20:00:00-05:00",
  endsAt: null,
  imageUrl: null,
  currency: "COP",
  latitude: null,
  longitude: null,
  host: null,
  venue: null,
  tickets: [],
};
const tier = { id: "t-1", name: "General", priceCents: 4000000, currency: "COP", qtyTotal: 50, qtySold: 0, position: 1 };

describe("EventDetailView ticket truth", () => {
  it("does not claim sold out when an event has no ticket tiers", () => {
    const html = renderToStaticMarkup(<EventDetailView event={baseEvent} />);
    expect(html).toContain("Price TBD");
    expect(html).toContain("No ticket tiers are listed for this event");
    expect(html).not.toContain("Sold out");
  });
  it("keeps paid and genuinely sold-out tier states distinct", () => {
    const paid = renderToStaticMarkup(<EventDetailView event={{...baseEvent,tickets:[tier]}} />);
    expect(paid).toContain("From $40,000 COP");
    const sold = renderToStaticMarkup(<EventDetailView event={{...baseEvent,tickets:[{...tier,qtySold:50}]}} />);
    expect(sold).toContain("Sold out");
    expect(sold).not.toContain("Price TBD");
  });
});