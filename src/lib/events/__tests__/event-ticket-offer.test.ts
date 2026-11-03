import { describe, expect, it } from "vitest";
import { summarizeEventTicketOffer, type EventTicketTier } from "../event-ticket-offer";

const tier = (price_cents: number, overrides: Partial<EventTicketTier> = {}): EventTicketTier => ({
  price_cents, currency: "COP", qty_total: 10, qty_sold: 0, qty_pending: 0,
  sale_starts_at: null, sale_ends_at: null, ...overrides,
});

describe("canonical live event ticket offers", () => {
  it("never invents free tickets when no tier exists", () => {
    expect(summarizeEventTicketOffer([])).toEqual({
      pricePerTicket: null, canBuyTickets: false, currency: null,
    });
  });
  it("uses the cheapest available tier, never a legacy summary column", () => {
    expect(summarizeEventTicketOffer([tier(12000000), tier(4000000)])).toEqual({
      pricePerTicket: 40000, canBuyTickets: true, currency: "COP",
    });
  });
  it("treats a genuine zero-priced stored tier as free", () => {
    expect(summarizeEventTicketOffer([tier(0)])).toEqual({
      pricePerTicket: 0, canBuyTickets: true, currency: "COP",
    });
  });
  it("keeps known price but hides Buy for sold-out / future-sale tickets", () => {
    expect(summarizeEventTicketOffer([tier(4000000,{qty_sold:10})])).toMatchObject({
      pricePerTicket: 40000, canBuyTickets: false,
    });
    expect(summarizeEventTicketOffer([tier(1000000,{sale_starts_at:"2099-01-01T00:00:00Z"})])).toMatchObject({
      pricePerTicket: 10000, canBuyTickets: false,
    });
  });
  it("uses a purchasable tier when cheaper tickets are exhausted", () => {
    expect(summarizeEventTicketOffer([tier(4000000,{qty_sold:10}),tier(12000000)])).toEqual({
      pricePerTicket: 120000, canBuyTickets: true, currency: "COP",
    });
  });
});
