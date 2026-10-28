// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventDetailView } from "../event-detail-view";
import type { PublicEventDetail } from "@/lib/events/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/components/modals/booking-checkout-modal", () => ({
  BookingCheckoutModal: ({ target }: {
    target: { tier: { id: string }; quantity: number } | null
  }) => target
    ? <div data-testid="checkout-selection">{target.tier.id}:{target.quantity}</div>
    : null,
}));

const base: PublicEventDetail = {
  id: "a1b2c3d4-0001-0001-0001-000000000003",
  slug: null, name: "Sample event", description: null,
  address: "Avenida El Poblado, Medellín", city: "Medellín",
  startsAt: "2026-12-06T14:00:00Z", endsAt: "2026-12-06T18:00:00Z",
  imageUrl: null, currency: "COP", latitude: 6.21, longitude: -75.57,
  source: "manual", mapsUrl: null, host: null, venue: null, tickets: [],
};
const a = { id: "tier-ga", name: "General", priceCents: 3000000, currency: "COP", qtyTotal: 30, qtySold: 0, position: 1 };
const b = { id: "tier-vip", name: "VIP", priceCents: 9000000, currency: "COP", qtyTotal: 20, qtySold: 0, position: 2 };

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SAN-1600 public detail journeys", () => {
  it("shows one heading and truthful zero-tier actions with real event context", () => {
    const { container } = render(<EventDetailView event={base} />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByText("Price TBD")).toBeTruthy();
    expect(screen.queryByText("Sold out")).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Events/i }).getAttribute("href")).toBe("/events");
    expect(screen.getByRole("link", { name: /Ask MDE about this event/i }).getAttribute("href")).toContain(encodeURIComponent(base.id));
    expect(screen.getByTestId("event-image-placeholder")).toBeTruthy();
    expect(screen.getByTestId("event-source-note")).toBeTruthy();
    expect(screen.getByTestId("event-directions").getAttribute("href")).toContain("destination=Avenida");
  });

  it("mobile CTA focuses tier picker and does not create a wrong one-ticket checkout", () => {
    render(<EventDetailView event={{ ...base, tickets: [a, b] }} />);
    fireEvent.click(screen.getByTestId("event-detail-mobile-buy-cta"));
    expect(screen.getByTestId("event-ticket-picker")).toBe(document.activeElement);
    expect(screen.queryByTestId("checkout-selection")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Increase VIP quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase VIP quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy VIP" }));
    expect(screen.getByTestId("checkout-selection").textContent).toBe("tier-vip:3");
  });

  it("copies a canonical URL when native share is absent and announces success", async () => {
    const copied = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copied } });
    render(<EventDetailView event={base} />);
    fireEvent.click(screen.getByTestId("event-share"));
    await waitFor(() => expect(screen.getByTestId("event-share-announcement").textContent).toBe("Link copied"));
    expect(copied).toHaveBeenCalledWith(expect.stringContaining(`/events/${base.id}`));
  });

  it("never invents a waitlist on sold-out events", () => {
    render(<EventDetailView event={{ ...base, tickets: [{ ...a, qtySold: 30 }] }} />);
    expect(screen.getAllByText("Sold out").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Join the waitlist/i)).toBeNull();
    expect(screen.queryByTestId("event-detail-mobile-buy-bar")).toBeNull();
  });
});
