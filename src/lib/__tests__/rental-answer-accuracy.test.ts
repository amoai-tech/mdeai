import { describe, expect, it } from "vitest";
import {
  buildMatchReason,
  fastPathRentalSummary,
  unappliedRentalRequests,
  type RentalResultRow,
} from "@/lib/rental-display";

/**
 * A renter who asks for "a pet friendly 1 bedroom in El Poblado" must not be told a 3 bedroom
 * "fits your bedroom ask", and must be told when a request cannot be applied at all.
 */
const row = (bedrooms: number): RentalResultRow =>
  ({ id: "r1", title: "Test", neighborhood: "El Poblado", bedrooms }) as RentalResultRow;

describe("buildMatchReason — bedrooms", () => {
  it("says a larger place is larger than the ask, instead of calling it a fit", () => {
    const text = buildMatchReason(row(3), { neighborhood: "El Poblado", minBedrooms: 1 } as never);
    expect(text).toContain("3 BR (bigger than the 1 BR you asked for)");
    expect(text).not.toMatch(/fits your bedroom ask/i);
  });

  it("says an exact match is what was asked for", () => {
    expect(buildMatchReason(row(2), { minBedrooms: 2 } as never)).toContain("2 BR, as you asked");
  });

  it("names a studio as a studio", () => {
    expect(buildMatchReason(row(0), { minBedrooms: 0 } as never)).toContain("Studio, as you asked");
  });
});

describe("unappliedRentalRequests", () => {
  it("finds pets and furnished in the renter's own words", () => {
    expect(unappliedRentalRequests("Find me a furnished 2 bedroom in Laureles, pet friendly")).toEqual([
      "pet-friendly",
      "furnished",
    ]);
    expect(unappliedRentalRequests("I have a dog")).toEqual(["pet-friendly"]);
  });

  it("does not fire on ordinary searches or look-alike words", () => {
    expect(unappliedRentalRequests("2 bedroom in Laureles under $1500 a month")).toEqual([]);
    expect(unappliedRentalRequests("a place with a carpet and a catalog")).toEqual([]);
    expect(unappliedRentalRequests("unfurnished please")).toEqual(["unfurnished"]);
  });
});

describe("fastPathRentalSummary — requests the search cannot apply", () => {
  it("names them after the results instead of dropping them silently", () => {
    const text = fastPathRentalSummary(2, 2, { unappliedRequests: ["pet-friendly", "furnished"] });
    expect(text.startsWith("Found 2 rentals")).toBe(true);
    expect(text).toContain("I can't filter by pet-friendly and furnished yet, so check each card.");
  });

  it("adds nothing when every request was applied", () => {
    expect(fastPathRentalSummary(2, 2, { unappliedRequests: [] })).not.toMatch(/can't filter/);
  });

  it("an empty answer names them too, without blaming them for the empty result", () => {
    const text = fastPathRentalSummary(0, 0, { unappliedRequests: ["pet-friendly"] });
    expect(text).toMatch(/no rentals/i);
    expect(text).toContain("I can't filter by pet-friendly yet.");
  });
});
