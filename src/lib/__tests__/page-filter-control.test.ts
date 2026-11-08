import { describe, expect, it } from "vitest";
import { buildRentalPageControlUrl, parseRentalPageCommand, rentalPageControlSchema, resolveRentalPageControl } from "@/lib/rentals/browse-page-control";
import { buildEventPageControlUrl, eventPageControlSchema } from "@/lib/events/browse-page-control";

const rental = { neighborhood: "Laureles", beds: "2", from: null, through: null };

describe("page filter control", () => {
  it("merges only the requested native rental filters and preserves the rest", () => {
    expect(buildRentalPageControlUrl(rental, { beds: "1" })).toBe(
      "/rentals?neighborhood=Laureles&beds=1",
    );
    expect(buildRentalPageControlUrl(rental, { neighborhood: null })).toBe("/rentals?beds=2");
  });

  it("parses explicit page commands and leaves unsupported criteria to search", () => {
    expect(parseRentalPageCommand("On this page, show only 1-bedroom apartments in Laureles.")).toEqual({
      neighborhood: "Laureles",
      beds: "1",
    });
    expect(parseRentalPageCommand("Find furnished 2-bedroom apartments in Laureles under COP 3M.")).toBeNull();
    expect(parseRentalPageCommand("On this page, show furnished apartments.")).toBeNull();
  });

  it("rejects a date order that is reversed only after merging current filters", () => {
    const result = resolveRentalPageControl(
      { neighborhood: "Laureles", beds: "2", from: "2026-11-10", through: null },
      { through: "2026-11-01" },
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining("reversed") });
  });

  it("keeps canonical 'any date' and no-price URLs canonical", () => {
    expect(buildEventPageControlUrl({ dateWindow: "any", price: null }, {})).toBe("/events");
  });

  it("rejects unsupported rental filter keys and invalid bed values", () => {
    expect(rentalPageControlSchema.safeParse({ furnished: true }).success).toBe(false);
    expect(rentalPageControlSchema.safeParse({ beds: "4" }).success).toBe(false);
  });

  it("builds the existing event filter URL and clears with null", () => {
    const current = { category: "music" as const, neighborhood: "Laureles", dateWindow: "this_weekend" as const, price: null };
    expect(buildEventPageControlUrl(current, { category: "nightlife" })).toBe(
      "/events?category=nightlife&neighborhood=Laureles&dateWindow=this_weekend",
    );
    expect(buildEventPageControlUrl(current, { dateWindow: "any", price: "paid" })).toBe(
      "/events?category=music&neighborhood=Laureles&price=paid",
    );
    expect(eventPageControlSchema.safeParse({ category: "salsa" }).success).toBe(false);
  });
});
