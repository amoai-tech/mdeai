// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EventTicketTiers } from "../event-ticket-tiers";
import { EventVenueDetailBody } from "@/components/sheets/event-venue-detail-body";
import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";
import type { EventVenueDetail } from "@/components/chat/rental-ui-context";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
// Stand-in for the Stripe modal: exposes exactly what checkout would receive.
vi.mock("@/components/modals/booking-checkout-modal", () => ({
  BookingCheckoutModal: ({ target, onClose }: {
    target: { tier: { id: string }; quantity: number } | null;
    onClose: () => void;
  }) => target ? (
    <div>
      <div data-testid="checkout-selection">{target.tier.id}:{target.quantity}</div>
      <button type="button" onClick={onClose}>Cancel checkout</button>
    </div>
  ) : null,
}));

afterEach(cleanup);

const tier = (over: Partial<PublicEventTicket>): PublicEventTicket => ({
  id: "t", name: "T", priceCents: 1000, currency: "COP", qtyTotal: 30, qtySold: 0, position: 0, ...over,
});
const ga = tier({ id: "tier-ga", name: "General", priceCents: 3000000, position: 1 });
const vip = tier({ id: "tier-vip", name: "VIP", priceCents: 9000000, position: 2, qtyTotal: 20 });

const event = (tickets: PublicEventTicket[]) => ({ id: "evt-1", name: "Sample event", tickets });
const cta = () => screen.getByTestId("event-sheet-checkout-cta") as HTMLButtonElement;
const plus = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Increase ${name} quantity` }));

describe("SAN-1600 compact (chat sheet) checkout targets the selected tier", () => {
  it("VIP × 3 reaches checkout as the VIP tier with quantity 3, never General × 1", () => {
    const onCheckout = vi.fn();
    render(<EventTicketTiers event={event([ga, vip])} compactFooter onCheckout={onCheckout} />);
    plus("VIP");
    plus("VIP");
    expect(cta().textContent).toContain("VIP × 3");
    fireEvent.click(cta());
    expect(onCheckout).toHaveBeenCalledOnce();
    expect(onCheckout.mock.calls[0][0]).toMatchObject({ tier: { id: "tier-vip" }, quantity: 3 });
  });

  it("selecting VIP at its default quantity does not fall back to the cheapest tier", () => {
    const onCheckout = vi.fn();
    render(<EventTicketTiers event={event([ga, vip])} compactFooter onCheckout={onCheckout} />);
    expect(cta().textContent).toContain("General × 1");
    fireEvent.click(screen.getAllByTestId("event-tier-select")[1]);
    fireEvent.click(cta());
    expect(onCheckout.mock.calls[0][0]).toMatchObject({ tier: { id: "tier-vip" }, quantity: 1 });
  });

  it("defaults to the cheapest tier that still has stock", () => {
    const onCheckout = vi.fn();
    render(<EventTicketTiers event={event([{ ...ga, qtySold: 30 }, vip])} compactFooter onCheckout={onCheckout} />);
    fireEvent.click(cta());
    expect(onCheckout.mock.calls[0][0]).toMatchObject({ tier: { id: "tier-vip" }, quantity: 1 });
  });

  it("disables payment when the selected tier is set to 0 instead of buying another tier", () => {
    const onCheckout = vi.fn();
    render(<EventTicketTiers event={event([ga, vip])} compactFooter onCheckout={onCheckout} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease General quantity" }));
    expect(cta().disabled).toBe(true);
    fireEvent.click(cta());
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it("caps a tier at the 8-ticket order limit and the remaining stock", () => {
    render(<EventTicketTiers event={event([{ ...ga, qtyTotal: 30 }, { ...vip, qtyTotal: 2 }])} compactFooter onCheckout={vi.fn()} />);
    for (let i = 0; i < 10; i++) plus("General");
    expect(cta().textContent).toContain("General × 8");
    plus("VIP");
    plus("VIP");
    expect(cta().textContent).toContain("VIP × 2");
  });

  it("shows a free tier as a purchasable selection with the right price text", () => {
    const onCheckout = vi.fn();
    render(<EventTicketTiers event={event([tier({ id: "tier-free", name: "RSVP", priceCents: 0 })])} compactFooter onCheckout={onCheckout} />);
    fireEvent.click(cta());
    expect(onCheckout.mock.calls[0][0]).toMatchObject({ tier: { id: "tier-free", priceCents: 0 }, quantity: 1 });
  });

  it("offers no payment button for sold-out or zero-tier events", () => {
    const { rerender } = render(<EventTicketTiers event={event([{ ...ga, qtySold: 30 }])} compactFooter onCheckout={vi.fn()} />);
    expect(screen.queryByTestId("event-sheet-checkout-cta")).toBeNull();
    expect(screen.getByTestId("event-tiers-sold-out")).toBeTruthy();
    rerender(<EventTicketTiers event={event([])} compactFooter onCheckout={vi.fn()} />);
    expect(screen.queryByTestId("event-sheet-checkout-cta")).toBeNull();
    expect(screen.getByTestId("event-tier-empty")).toBeTruthy();
  });
});

describe("SAN-1600 chat sheet end to end (selection survives cancelled checkout)", () => {
  const detail: EventVenueDetail = {
    kind: "event", eventId: "evt-1", pinId: "event-evt-1", title: "Sample event",
    neighborhood: "Poblado", venue: "Parque Lleras", startsAt: "2026-12-06T14:00:00Z",
    pricePerTicket: 30000, currency: "COP", canBuyTickets: true, ticketUrl: "/events/evt-1",
  };
  const publicEvent: PublicEventDetail = {
    id: "evt-1", slug: null, name: "Sample event", description: null, address: null, city: "Medellín",
    startsAt: "2026-12-06T14:00:00Z", endsAt: null, imageUrl: null, currency: "COP",
    latitude: null, longitude: null, source: "manual", mapsUrl: null, host: null, venue: null,
    tickets: [ga, vip],
  };

  it("sends VIP × 3 to checkout and keeps VIP × 3 after the buyer cancels", () => {
    render(<EventVenueDetailBody detail={detail} step="checkout" loadState="ready"
      publicEvent={publicEvent} loadError={null} onStepChange={vi.fn()} />);
    plus("VIP");
    plus("VIP");
    fireEvent.click(cta());
    expect(screen.getByTestId("checkout-selection").textContent).toBe("tier-vip:3");
    fireEvent.click(screen.getByRole("button", { name: "Cancel checkout" }));
    expect(screen.queryByTestId("checkout-selection")).toBeNull();
    expect(cta().textContent).toContain("VIP × 3");
    expect((screen.getAllByTestId("event-tier-select")[1] as HTMLInputElement).checked).toBe(true);
  });
});
