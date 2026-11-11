import { describe, expect, it } from "vitest";
import { isEventLookupUuid } from "@/lib/events/event-lookup";
import {
  formatEventBadgeDate,
  formatEventCardPrice,
  formatEventSchedule,
  formatTicketPrice,
  ticketAvailability,
  ticketsRemaining,
} from "@/lib/events/format-event";

describe("isEventLookupUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isEventLookupUuid("22222222-2222-2222-2222-000000000001")).toBe(true);
  });

  it("rejects slugs", () => {
    expect(isEventLookupUuid("reina-de-antioquia-2026-finals")).toBe(false);
  });
});

describe("formatTicketPrice", () => {
  it("formats COP centavos", () => {
    expect(formatTicketPrice(4_000_000, "COP")).toBe("$40,000 COP");
  });

  it("normalizes lowercase and mixed-case COP instead of falling through", () => {
    expect(formatTicketPrice(4_000_000, "cop")).toBe("$40,000 COP");
    expect(formatTicketPrice(4_000_000, "Cop")).toBe("$40,000 COP");
  });

  it("shows a zero-price tier as Free, not a fabricated paid amount", () => {
    expect(formatTicketPrice(0, "COP")).toBe("Free");
  });
});

describe("formatEventCardPrice", () => {
  it("formats USD as a plain $ amount (unchanged from prior card output)", () => {
    expect(formatEventCardPrice(1500, "USD")).toBe("$1,500");
  });

  it("suffixes COP to disambiguate from the shared $ sign", () => {
    expect(formatEventCardPrice(80000, "COP")).toBe("$80,000 COP");
  });

  it("defaults unknown/null currency to USD form", () => {
    expect(formatEventCardPrice(50, null)).toBe("$50");
    expect(formatEventCardPrice(50, undefined)).toBe("$50");
  });
});

describe("formatEventSchedule", () => {
  it("shows Medellín times independent of the server/browser timezone", () => {
    expect(
      formatEventSchedule("2026-10-19T21:00:00.000Z", "2026-10-20T02:00:00.000Z"),
    ).toBe("Mon, Oct 19, 2026, 4:00 PM – 9:00 PM");
  });

  it("uses Medellín local dates to decide whether the event spans two days", () => {
    expect(
      formatEventSchedule("2026-10-19T04:30:00.000Z", "2026-10-19T06:30:00.000Z"),
    ).toBe("Sun, Oct 18, 2026, 11:30 PM – Mon, Oct 19, 2026, 1:30 AM");
  });

  it("makes the year explicit when an event crosses into the new year", () => {
    expect(formatEventSchedule("2026-12-31T23:00:00Z", "2027-01-01T07:00:00Z"))
      .toBe("Thu, Dec 31, 2026, 6:00 PM – Fri, Jan 1, 2027, 2:00 AM");
  });

  it("shows end time on same day", () => {
    const label = formatEventSchedule(
      "2027-02-24T01:00:00.000Z",
      "2027-02-24T05:30:00.000Z",
    );
    expect(label).toMatch(/–/);
  });
});

describe("ticketAvailability", () => {
  const base = {
    qtyTotal: 10,
    qtySold: 0,
    qtyPending: 0,
    minPerOrder: 1,
    saleStartsAt: null,
    saleEndsAt: null,
  };

  it("distinguishes every public sellability state", () => {
    expect(ticketAvailability(base)).toBe("available");
    expect(ticketAvailability({ ...base, qtyTotal: 3, qtySold: 3 })).toBe("sold-out");
    expect(ticketAvailability({ ...base, saleStartsAt: "2099-01-01T00:00:00Z" })).toBe("not-yet-on-sale");
    expect(ticketAvailability({ ...base, saleEndsAt: "2000-01-01T00:00:00Z" })).toBe("sale-ended");
    expect(ticketAvailability({ ...base, qtyTotal: 1, minPerOrder: 2 })).toBe("below-minimum");
  });

  it("treats pending reservations exactly like sold seats for availability", () => {
    expect(ticketAvailability({ ...base, qtyTotal: 3, qtyPending: 2 })).toBe("available");
    expect(ticketAvailability({ ...base, qtyTotal: 3, qtyPending: 3 })).toBe("sold-out");
  });
});

describe("ticketsRemaining", () => {
  it("never goes below zero", () => {
    expect(ticketsRemaining(10, 12)).toBe(0);
    expect(ticketsRemaining(100, 7)).toBe(93);
  });

  it("subtracts pending reservations as well as committed sales", () => {
    expect(ticketsRemaining(10, 2, 3)).toBe(5);
    expect(ticketsRemaining(10, 2, 9)).toBe(0);
  });

  it("returns 0 for corrupt inventory rather than a negative number", () => {
    expect(ticketsRemaining(Number.NaN, 0, 0)).toBe(0);
    expect(ticketsRemaining(10, 0, Number.NaN)).toBe(0);
  });
});

describe("formatEventBadgeDate", () => {
  it("derives the month and day from the real record in Medellín time", () => {
    // 2026-02-24T02:00Z is still the 23rd in Bogotá (UTC-5): a badge must not show the UTC day.
    expect(formatEventBadgeDate("2026-02-24T02:00:00.000Z")).toEqual({ month: "FEB", day: "23" });
  });

  it("returns null for an unusable timestamp so the card degrades instead of lying", () => {
    expect(formatEventBadgeDate("not-a-date")).toBeNull();
  });
});
