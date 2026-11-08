import { describe, expect, it } from "vitest";
import { buildRentalPageControlUrl, rentalPageControlSchema } from "@/lib/rentals/browse-page-control";
import { buildEventPageControlUrl, eventPageControlSchema } from "@/lib/events/browse-page-control";

const rental = { neighborhood: "Laureles", beds: "2", from: null, through: null };

describe("page filter control", () => {
  it("merges only the requested native rental filters and preserves the rest", () => {
    expect(buildRentalPageControlUrl(rental, { beds: "1" })).toBe(
      "/rentals?neighborhood=Laureles&beds=1",
    );
    expect(buildRentalPageControlUrl(rental, { neighborhood: null })).toBe("/rentals?beds=2");
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
