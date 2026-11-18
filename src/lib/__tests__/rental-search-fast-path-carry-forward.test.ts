import { describe, expect, it } from "vitest";
import { carryForwardVisibleFilters } from "@/lib/rental-search-fast-path";

/**
 * Regression for a captured production payload pair (SAN-1690 post-merge QA).
 *
 * Turn 1 — "Find furnished 2-bedroom apartments in Laureles under COP 3 million."
 * Turn 2 — "Only under COP 2.5 million."
 *
 * The parser re-derives filters from the latest words, so turn 2 came back without
 * `furnished` and `maxBedrooms`, and the request the browser actually sent dropped
 * both — silently turning a narrowing follow-up into a WIDER search that could
 * return unfurnished apartments.
 */
const TURN_1_SHOWN = {
  neighborhood: "Laureles",
  minBedrooms: 2,
  maxBedrooms: 2,
  furnished: true,
  maxPriceMonthly: 3_000_000,
  budgetCurrency: "COP" as const,
  stayType: "monthly" as const,
};

/** Exactly what the parser produced for turn 2: price tightened, filters lost. */
const TURN_2_PARSED = {
  neighborhood: "Laureles",
  minBedrooms: 2,
  maxPriceMonthly: 2_500_000,
  budgetCurrency: "COP" as const,
  stayType: "monthly" as const,
};

describe("carryForwardVisibleFilters", () => {
  it("keeps furnished and exact bedrooms when only the budget is refined", () => {
    const merged = carryForwardVisibleFilters(TURN_2_PARSED, TURN_1_SHOWN, "Only under COP 2.5 million.");

    expect(merged).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxBedrooms: 2,
      furnished: true,
      maxPriceMonthly: 2_500_000,
      budgetCurrency: "COP",
      stayType: "monthly",
    });
    // The refinement itself must survive untouched.
    expect(merged.maxPriceMonthly).toBe(2_500_000);
  });

  it("does not resurrect a furnishing requirement the renter explicitly cleared", () => {
    const cleared = carryForwardVisibleFilters(
      { ...TURN_2_PARSED },
      TURN_1_SHOWN,
      "Only under COP 2.5 million, either furnished or unfurnished is fine.",
    );
    expect(cleared.furnished).toBeUndefined();
  });

  it("leaves params untouched when nothing is on screen to carry forward", () => {
    expect(carryForwardVisibleFilters(TURN_2_PARSED, undefined, "Only under COP 2.5 million."))
      .toEqual(TURN_2_PARSED);
  });

  it("keeps an explicit new constraint from the renter over the stored one", () => {
    const merged = carryForwardVisibleFilters(
      { ...TURN_2_PARSED, maxBedrooms: 3, furnished: false },
      TURN_1_SHOWN,
      "Only under COP 2.5 million, 3 bedrooms, unfurnished.",
    );
    expect(merged.maxBedrooms).toBe(3);
    expect(merged.furnished).toBe(false);
  });
});
