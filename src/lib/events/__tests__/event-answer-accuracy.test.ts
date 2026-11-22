import { describe, expect, it } from "vitest";
import { evaluateFaithfulness } from "@/mastra/scorers/faithfulness-core";
import type { EventCard } from "@/mastra/tools/search-events";
import { findEventFactMismatches, type ClaimedEventFacts } from "./event-answer-accuracy";
import { summarizeEventTicketOffer, type EventTicketTier } from "../event-ticket-offer";

const event = (
  id: string,
  title: string,
  startsAt: string,
  pricePerTicket: number | null,
  currency: "COP" | "USD" = "COP",
): EventCard => ({
  id, title, startsAt, pricePerTicket, currency,
  canBuyTickets: pricePerTicket !== null,
  category: "music", venue: "Test venue", neighborhood: "Laureles", imageUrl: "",
});

const salsa = event("event-a", "Salsa Sunrise", "2026-12-10T23:00:00Z", 100000);
const tech = event("event-b", "Tech Festival", "2026-12-11T23:00:00Z", 200000);
const rows = [salsa, tech];

const tier = (price_cents: number, overrides: Partial<EventTicketTier> = {}): EventTicketTier => ({
  price_cents, currency: "COP", qty_total: 10, qty_sold: 0, qty_pending: 0,
  sale_starts_at: null, sale_ends_at: null, ...overrides,
});

describe("SAN-611 · source-bound event answer facts", () => {
  it("reproduces the scorer's false positive on swapped event prices and dates", () => {
    const wrongReply = "Tech Festival costs 100000 COP on 2026-12-10.";
    // Both the price and date exist SOMEWHERE in the tool output.
    expect(evaluateFaithfulness({ toolOutputs: [{ results: rows }] }, { reply: wrongReply }).faithful).toBe(true);
    const mismatches = findEventFactMismatches(rows, [{
      id: tech.id, title: tech.title, startsAt: salsa.startsAt,
      pricePerTicket: salsa.pricePerTicket, currency: "COP",
    }]);
    expect(mismatches).toEqual([
      { eventId: tech.id, field: "startsAt" },
      { eventId: tech.id, field: "pricePerTicket" },
    ]);
  });

  it("does not report success when the answer contains zero checkable event claims", () => {
    expect(() => findEventFactMismatches(rows, [])).toThrow(/no structured event claims/i);
  });

  it("accepts the correct ID + price + date + currency from one source row", () => {
    expect(findEventFactMismatches(rows, [{
      id: tech.id, title: tech.title, startsAt: tech.startsAt,
      pricePerTicket: tech.pricePerTicket, currency: tech.currency,
      canBuyTickets: tech.canBuyTickets,
    }])).toEqual([]);
  });

  it("rejects nonexistent event IDs and mismatched titles and currencies", () => {
    const claims: ClaimedEventFacts[] = [
      { id: "invented-event", title: "Tech Festival", pricePerTicket: 200000 },
      { id: tech.id, title: salsa.title, currency: "USD" },
    ];
    expect(findEventFactMismatches(rows, claims)).toEqual([
      { eventId: "invented-event", field: "id" },
      { eventId: tech.id, field: "title" },
      { eventId: tech.id, field: "currency" },
    ]);
  });

  it("does not call unknown prices free or unavailable tickets purchasable", () => {
    const unknown = event("unknown-tier", "Mystery Tickets", tech.startsAt, null);
    const unknownOffer = summarizeEventTicketOffer([]);
    expect(unknownOffer).toMatchObject({ pricePerTicket: null, canBuyTickets: false });
    expect(findEventFactMismatches([unknown], [
      { id: unknown.id, pricePerTicket: 0, canBuyTickets: true },
    ])).toEqual([
      { eventId: unknown.id, field: "pricePerTicket" },
      { eventId: unknown.id, field: "canBuyTickets" },
    ]);

    const freeOffer = summarizeEventTicketOffer([tier(0)]);
    expect(freeOffer).toMatchObject({ pricePerTicket: 0, canBuyTickets: true });
    const soldOutOffer = summarizeEventTicketOffer([tier(5000000, { qty_sold: 10 })]);
    expect(soldOutOffer.canBuyTickets).toBe(false);
    expect(soldOutOffer.pricePerTicket).toBe(50000);
  });

  it("does not compare unlike currencies or another event's ticket tier as its own", () => {
    const usd = event("usd-event", "USD Event", tech.startsAt, 30, "USD");
    const mixed = [tech, usd];
    expect(findEventFactMismatches(mixed, [
      { id: tech.id, pricePerTicket: usd.pricePerTicket, currency: "USD" },
      { id: usd.id, pricePerTicket: tech.pricePerTicket, currency: "COP" },
    ])).toEqual([
      { eventId: tech.id, field: "pricePerTicket" },
      { eventId: tech.id, field: "currency" },
      { eventId: usd.id, field: "pricePerTicket" },
      { eventId: usd.id, field: "currency" },
    ]);
  });

  it("accepts different ISO timestamps for the same instant", () => {
    expect(findEventFactMismatches(rows, [
      { id: salsa.id, startsAt: "2026-12-10T23:00:00.000Z" },
      { id: salsa.id, startsAt: "2026-12-10T18:00:00-05:00" },
    ])).toEqual([]);
  });

  it("rejects a genuinely different instant and an invalid date", () => {
    expect(findEventFactMismatches(rows, [
      { id: salsa.id, startsAt: "2026-12-10T23:00:01Z" },
      { id: salsa.id, startsAt: "not a real date" },
    ])).toEqual([
      { eventId: salsa.id, field: "startsAt" },
      { eventId: salsa.id, field: "startsAt" },
    ]);
  });

  it("keeps unknown values distinct from explicit free/false facts", () => {
    const unknown = { ...salsa, pricePerTicket: null, canBuyTickets: undefined };
    expect(findEventFactMismatches([unknown], [
      { id: unknown.id, pricePerTicket: 0, canBuyTickets: false },
    ])).toEqual([
      { eventId: unknown.id, field: "pricePerTicket" },
      { eventId: unknown.id, field: "canBuyTickets" },
    ]);
    expect(findEventFactMismatches([unknown], [
      { id: unknown.id, pricePerTicket: null },
    ])).toEqual([]);
  });

  // TODO(SAN-611): Captured host-revenue replies must be checked separately
  // for invented *net* totals when partial refund amounts are unknown. The
  // existing summarizeEventOrders tests cover the source summary, not AI claims.
});
