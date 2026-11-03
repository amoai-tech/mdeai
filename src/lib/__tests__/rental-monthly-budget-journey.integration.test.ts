/**
 * SAN-386 / SAN-486 — the acceptance journey, against the real database.
 *
 * The unit suites prove the parser, the filter strings, and the card formatter separately.
 * This test is the one that proves they agree for the sentence a renter actually types:
 *
 *   "Find a 2-bedroom apartment in Laureles under COP 3 million."
 *     -> parser: 2 bedrooms, Laureles, COP 3,000,000 monthly, stayType monthly
 *     -> searchRentals: same-currency confirmed matches, other currencies uncompared
 *     -> card labels: COP monthly figures, never a USD symbol
 *
 * Gated on `hasLiveSupabase()` (`LIVE_SUPABASE_TESTS=1` plus server-only `SUPABASE_URL` /
 * `SUPABASE_ANON_KEY`), matching the other live suites. Read-only: it issues selects only.
 */
import { describe, expect, it } from "vitest";
import { formatRentalPrices } from "@/lib/rental-display";
import { buildRentalSearchParams } from "@/lib/rental-query-parser";
import { MONTHLY_BUDGET_NOTE, searchRentals } from "@/mastra/tools/search-rentals";
import { hasLiveSupabase } from "@/mastra/lib/__tests__/live-supabase-gate";

const QUERY = "Find a 2-bedroom apartment in Laureles under COP 3 million.";
const CAP = 3_000_000;

describe.skipIf(!hasLiveSupabase())("monthly-budget acceptance journey (live)", () => {
  it("turns the renter's sentence into a COP monthly cap that the database and cards honour", async () => {
    const params = buildRentalSearchParams(QUERY, {});
    expect(params).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxPriceMonthly: CAP,
      budgetCurrency: "COP",
      stayType: "monthly",
    });
    // The budget must be a monthly cap, never a guessed nightly conversion.
    expect(params?.maxPricePerNight).toBeUndefined();

    const result = await searchRentals({ ...params, limit: 8 });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.budgetNote).toBe(MONTHLY_BUDGET_NOTE);
    expect(result.total).toBeGreaterThanOrEqual(result.results.length);

    const copMatches = result.results.filter((r) => r.currency === "COP");
    expect(copMatches.length).toBeGreaterThan(0);
    for (const row of copMatches) {
      // A confirmed COP match must carry a stored monthly price within the cap.
      expect(row.price_monthly).toBeDefined();
      expect(row.price_monthly as number).toBeLessThanOrEqual(CAP);
    }

    // The card label carries the listing's own currency. A COP rent must never show "$".
    for (const row of result.results) {
      const labels = formatRentalPrices(row.nightly_price, row.price_monthly, row.currency);
      if (row.currency === "COP") {
        expect(labels.monthlyLabel).toContain("COP");
        expect(labels.monthlyLabel).not.toContain("$");
      }
    }
  });
});
