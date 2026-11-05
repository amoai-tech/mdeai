import { describe, expect, it } from "vitest";
import { eventDetailAction, remainingSeats } from "../event-detail-action";
import type { PublicEventTicket } from "../types";

const tier = (over: Partial<PublicEventTicket> = {}): PublicEventTicket => ({
  id: "t1", name: "GA", priceCents: 4_000_000, currency: "COP",
  qtyTotal: 100, qtySold: 0, qtyPending: 0, minPerOrder: 1, maxPerOrder: 10,
  saleStartsAt: null, saleEndsAt: null, position: 1, ...over,
});

describe("SAN-1620 — the event action never invents availability", () => {
  it("offers the cheapest tier that still has seats", () => {
    const action = eventDetailAction({ tickets: [tier({ id: "vip", priceCents: 12_000_000 }), tier({ id: "ga" })] });
    expect(action.kind).toBe("tickets");
    if (action.kind === "tickets") expect(action.tier.id).toBe("ga");
  });

  it("treats an event with no tiers as follow, not free and not sold out", () => {
    expect(eventDetailAction({ tickets: [] })).toEqual({ kind: "follow" });
  });

  it("says sold out only when real tiers exist and none has seats", () => {
    expect(eventDetailAction({ tickets: [tier({ qtyTotal: 10, qtySold: 10 })] })).toEqual({ kind: "sold-out" });
  });

  it("skips an exhausted tier and still offers a remaining one", () => {
    const action = eventDetailAction({
      tickets: [
        tier({ id: "ga", priceCents: 4_000_000, qtyTotal: 10, qtySold: 10 }),
        tier({ id: "vip", priceCents: 12_000_000, qtyTotal: 5, qtySold: 1 }),
      ],
    });
    expect(action.kind).toBe("tickets");
    if (action.kind === "tickets") expect(action.tier.id).toBe("vip");
  });

  it("never returns a negative seat count for corrupt inventory", () => {
    expect(remainingSeats({ qtyTotal: 3, qtySold: 9 })).toBe(0);
    expect(remainingSeats({ qtyTotal: Number.NaN, qtySold: 0 })).toBe(0);
  });

  it("treats a pending reservation as unavailable capacity", () => {
    expect(remainingSeats({ qtyTotal: 3, qtySold: 0, qtyPending: 3 })).toBe(0);
    expect(eventDetailAction({ tickets: [tier({ qtyTotal: 3, qtySold: 0, qtyPending: 3 })] }))
      .toEqual({ kind: "sold-out" });
  });

  it("distinguishes a closed sale window and a minimum-order mismatch from sold out", () => {
    expect(eventDetailAction({ tickets: [tier({ saleStartsAt: "2099-01-01T00:00:00Z" })] }))
      .toMatchObject({ kind: "unavailable", reason: "not-yet-on-sale" });
    expect(eventDetailAction({ tickets: [tier({ qtyTotal: 1, minPerOrder: 2 })] }))
      .toMatchObject({ kind: "unavailable", reason: "below-minimum" });
  });
});
