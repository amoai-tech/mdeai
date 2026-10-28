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
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
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
    expect(screen.getByTestId("event-listed-area-map").getAttribute("href")).toContain("query=Avenida");
    expect(screen.queryByTestId("event-directions")).toBeNull();
    expect(screen.getByTestId("event-location-unconfirmed").textContent).toContain("not been confirmed");
    expect(screen.getByTestId("event-image-placeholder").textContent).toContain("photo not available");
    expect(screen.queryByText("Event photo coming soon")).toBeNull();
  });

  it("offers exact directions when a real linked venue exists", () => {
    render(<EventDetailView event={{ ...base, venue: {
      name: "Hotel Intercontinental", address: "Calle 16 #28-51", city: "Medellín",
    } }} />);
    expect(screen.getByTestId("event-directions").getAttribute("href")).toContain("destination=Calle");
    expect(screen.queryByTestId("event-listed-area-map")).toBeNull();
    expect(screen.queryByTestId("event-location-unconfirmed")).toBeNull();
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

  it("shows the event date on the placeholder in Colombia time and keeps the honest no-photo label", () => {
    render(<EventDetailView event={base} />);
    const tile = screen.getByTestId("event-image-placeholder");
    expect(tile.getAttribute("aria-label")).toBe("No event photo available");
    expect(screen.getByTestId("event-date-tile-day").textContent).toBe("6");
    expect(tile.textContent).toContain("December");
    expect(tile.textContent).toContain("Sunday");
  });

  it("moves the stored listing notice out of About into a visible note", () => {
    const description = "Parade of flowers.\n\nListing notice: MDE has not verified an organizer announcement for this date.";
    render(<EventDetailView event={{ ...base, description }} />);
    const note = screen.getByTestId("event-source-note");
    expect(note.getAttribute("role")).toBe("note");
    expect(note.textContent).toContain("has not verified an organizer announcement");
    expect(note.textContent).not.toMatch(/^Listing notice/);
    const about = screen.getByText("Parade of flowers.");
    expect(about.textContent).not.toContain("Listing notice");
  });

  it("has one ticket heading and makes Ask MDE the primary action only when there is nothing to buy", () => {
    const { unmount } = render(<EventDetailView event={base} />);
    expect(screen.queryByText("Tickets & registration")).toBeNull();
    expect(screen.getByTestId("event-ask-mde").className).toContain("bg-primary");
    unmount();
    render(<EventDetailView event={{ ...base, tickets: [a] }} />);
    expect(screen.getByTestId("event-ask-mde").className).not.toContain("bg-primary");
  });

  it("Back goes to /events by default and to /chat only for the allowlisted chat origin", () => {
    const { unmount } = render(<EventDetailView event={base} />);
    expect(screen.getByTestId("event-back").getAttribute("href")).toBe("/events");
    unmount();
    render(<EventDetailView event={base} backTo="chat" />);
    expect(screen.getByTestId("event-back").getAttribute("href")).toBe("/chat");
    expect(screen.getByTestId("event-back").textContent).toContain("Back to chat");
  });

  it("shows stored practical details and omits the section when nothing is stored", () => {
    const { unmount } = render(<EventDetailView event={base} />);
    expect(screen.queryByTestId("event-facts")).toBeNull();
    unmount();
    render(<EventDetailView event={{ ...base, facts: {
      artist: "Ryan Castro", genre: "Reggaeton", ticketInfo: null, listingSource: "Concerts50",
      highlights: ["Doors at 7pm"],
    } }} />);
    const facts = screen.getByTestId("event-facts").textContent ?? "";
    expect(facts).toContain("Ryan Castro");
    expect(facts).toContain("Concerts50");
    expect(facts).toContain("Doors at 7pm");
    expect(facts).not.toContain("Tickets");
  });

  it("preserves native share success and does not overwrite it with clipboard status", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<EventDetailView event={base} />);
    fireEvent.click(screen.getByTestId("event-share"));
    await waitFor(() => expect(screen.getByTestId("event-share-announcement").textContent).toBe("Event shared"));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: base.name, url: expect.stringContaining(`/events/${base.id}`),
    }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("leaves the announcement unchanged when native sharing is canceled", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Canceled", "AbortError"));
    const writeText = vi.fn();
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<EventDetailView event={base} />);
    fireEvent.click(screen.getByTestId("event-share"));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByTestId("event-share-announcement").textContent).toBe(""));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the link after a native-share failure", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<EventDetailView event={base} />);
    fireEvent.click(screen.getByTestId("event-share"));
    await waitFor(() => expect(screen.getByTestId("event-share-announcement").textContent).toBe("Link copied"));
    expect(share).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledOnce();
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
