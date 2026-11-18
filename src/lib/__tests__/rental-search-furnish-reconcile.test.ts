import { describe, expect, it } from "vitest";
import { reconcileFurnishingFromVisible, type RentalSearchApiParams } from "@/lib/rental-search-fast-path";

/**
 * Review finding (PR #904): a saved conversation created before the fast path stored
 * `furnished` restores `lastRentalQuery` without it while the visible search is
 * furnished. Treating that absence as "unfurnished" made the equality guard reject the
 * visible search, so the budget follow-up was rebuilt from stale memory without the
 * preference and unfurnished apartments could appear.
 */
describe("reconcileFurnishingFromVisible", () => {
  const legacy: RentalSearchApiParams = {
    neighborhood: "Laureles",
    minBedrooms: 2,
    maxBedrooms: 2,
    maxPriceMonthly: 3_000_000,
    budgetCurrency: "COP" as const,
    stayType: "monthly" as const,
  };

  it("adopts the visible preference when restored memory predates the field", () => {
    expect(reconcileFurnishingFromVisible(legacy, { furnished: true })?.furnished).toBe(true);
  });

  it("never overwrites a preference memory already holds", () => {
    const kept: RentalSearchApiParams = { ...legacy, furnished: false };
    expect(reconcileFurnishingFromVisible(kept, { furnished: true })?.furnished).toBe(false);
  });

  it("does not invent a preference the visible search does not have", () => {
    expect(reconcileFurnishingFromVisible(legacy, {})?.furnished).toBeUndefined();
  });

  it("leaves memory untouched when there is no visible search", () => {
    expect(reconcileFurnishingFromVisible(legacy, undefined)).toBe(legacy);
  });

  it("is a no-op when there is no memory to reconcile", () => {
    expect(reconcileFurnishingFromVisible(undefined, { furnished: true })).toBeUndefined();
  });
});
