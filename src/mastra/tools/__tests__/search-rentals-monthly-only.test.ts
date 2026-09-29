/**
 * Regression test for the bug that emptied the rental marketplace.
 *
 * Rental search required `price_daily IS NOT NULL`, but the only application write path
 * (`src/lib/rentals/submit-broker-onboarding.ts`) stores `price_monthly`. Every listing the
 * product could actually create was therefore filtered out of search permanently, no matter
 * how complete or published it was. Production reached 49 listings and 0 visible.
 *
 * These tests pin three things:
 *   1. the query predicate accepts EITHER price, and a monthly-only row survives it;
 *   2. the nightly budget is compared against the same derived nightly used for display;
 *   3. a row with neither price is still excluded, so the fix did not simply drop the filter.
 */
import { describe, expect, it, vi } from "vitest";

/** USD-scale figures so a nightly budget and a monthly price are comparable. */
const mockApartmentRows = [
  {
    id: "apt-nightly",
    title: "Nightly-priced 1BR",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: 78,
    price_monthly: null,
    wifi_speed: 100,
    amenities: ["wifi"],
    images: [],
    host_name: "Host A",
    slug: "apt-nightly",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    latitude: 6.2442,
    longitude: -75.5812,
    status: "active",
    landlord_id: "lp-1",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
  {
    // The shape owner onboarding actually writes: monthly only, no nightly price.
    id: "apt-monthly",
    title: "Monthly-only 2BR",
    neighborhood: "Laureles",
    bedrooms: 2,
    price_daily: null,
    price_monthly: 2000,
    wifi_speed: 100,
    amenities: ["wifi"],
    images: [],
    host_name: "Host B",
    slug: "apt-monthly",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    latitude: 6.245,
    longitude: -75.582,
    status: "active",
    landlord_id: "lp-2",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
  {
    // Unpriced: must stay excluded. This is what stops the fix from being "delete the filter".
    id: "apt-unpriced",
    title: "Unpriced listing",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: null,
    price_monthly: null,
    wifi_speed: 100,
    amenities: [],
    images: [],
    host_name: "Host C",
    slug: "apt-unpriced",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    latitude: 6.246,
    longitude: -75.583,
    status: "active",
    landlord_id: "lp-3",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
];

/** The `or()` clauses the code emitted, so the predicate itself can be asserted. */
const mockEmittedOrClauses: string[] = [];

/**
 * Minimal stand-in for the Supabase query builder that actually EVALUATES the price
 * predicate, so a monthly-only row surviving the filter is real proof rather than a
 * recorded string. Availability clauses are accepted and ignored: this test is about price.
 */
function mockApartmentQueryStub(rows: Record<string, unknown>[]) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let limit: number | undefined;

  const evaluateCondition = (row: Record<string, unknown>, condition: string): boolean => {
    const parts = condition.split(".");
    const column = parts[0];
    const actual = row[column];
    // price_daily.not.is.null  → present
    if (parts[1] === "not" && parts[2] === "is" && parts[3] === "null") {
      return actual !== null && actual !== undefined;
    }
    // price_daily.lte.80       → numeric ceiling
    if (parts[1] === "lte") {
      if (actual === null || actual === undefined) return false;
      return Number(actual) <= Number(parts[2]);
    }
    // available_to.is.null / available_to.gte.<date> — not this test's subject.
    return true;
  };

  const evaluateAlternative = (row: Record<string, unknown>, alt: string): boolean => {
    if (alt.startsWith("and(") && alt.endsWith(")")) {
      return alt
        .slice(4, -1)
        .split(",")
        .every((condition) => evaluateCondition(row, condition));
    }
    return evaluateCondition(row, alt);
  };

  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    ilike: () => builder,
    or: (clause: string) => {
      mockEmittedOrClauses.push(clause);
      if (clause.includes("price_")) {
        filters.push((row) =>
          clause.split(/,(?![^()]*\))/).some((alt) => evaluateAlternative(row, alt)),
        );
      }
      return builder;
    },
    limit: (value: number) => {
      limit = value;
      return builder;
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const data = rows.filter((row) => filters.every((matches) => matches(row)));
      const sliced = limit === undefined ? data : data.slice(0, limit);
      return Promise.resolve({ data: sliced, error: null, count: sliced.length }).then(
        resolve,
        reject,
      );
    },
  };

  return builder;
}

vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerUrl: () => "https://stub.supabase.co",
  getSupabaseServerAnonKey: () => "stub-anon-key",
  getSupabaseServerAnonEnv: () => ({ url: "https://stub.supabase.co", anonKey: "stub-anon-key" }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => mockApartmentQueryStub(mockApartmentRows) }),
}));

describe("nightlyPriceFrom — one price derivation for both search paths", () => {
  it("prefers a stored nightly price", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_daily: 78, price_monthly: 3000 })).toBe(78);
  });

  it("derives an indicative nightly from the monthly price owner onboarding writes", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_daily: null, price_monthly: 2400 })).toBe(80);
  });

  it("returns 0 when neither price exists, rather than inventing one", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_daily: null, price_monthly: null })).toBe(0);
  });

  it("accepts the string numerics the hybrid row type carries", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_monthly: "2400" })).toBe(80);
  });
});

describe("searchRentals — monthly-only listings are findable", () => {
  it("returns a monthly-only listing instead of filtering it out", async () => {
    mockEmittedOrClauses.length = 0;
    const { searchRentals } = await import("../search-rentals");

    const result = await searchRentals({ neighborhood: "Laureles", limit: 10 });
    const ids = result.results.map((r) => r.id);

    expect(ids).toContain("apt-monthly");
    expect(ids).toContain("apt-nightly");
    // The filter still has to exclude a listing with no price at all.
    expect(ids).not.toContain("apt-unpriced");
  });

  it("derives the nightly price shown for a monthly-only listing", async () => {
    const { searchRentals } = await import("../search-rentals");

    const result = await searchRentals({ neighborhood: "Laureles", limit: 10 });
    const monthlyOnly = result.results.find((r) => r.id === "apt-monthly");

    // 2000 / 30 → 67, never Number(null) === 0.
    expect(monthlyOnly?.nightly_price).toBe(67);
    expect(monthlyOnly?.price_monthly).toBe(2000);
  });

  it("does not require price_daily in the emitted predicate", async () => {
    mockEmittedOrClauses.length = 0;
    const { searchRentals } = await import("../search-rentals");

    await searchRentals({ neighborhood: "Laureles", limit: 10 });
    const priceClause = mockEmittedOrClauses.find((c) => c.includes("price_"));

    expect(priceClause).toBeDefined();
    expect(priceClause).toContain("price_monthly.not.is.null");
  });

  it("compares a nightly budget against the monthly equivalent", async () => {
    mockEmittedOrClauses.length = 0;
    const { searchRentals } = await import("../search-rentals");

    await searchRentals({ neighborhood: "Laureles", maxPricePerNight: 80, limit: 10 });
    const priceClause = mockEmittedOrClauses.find((c) => c.includes("price_"));

    // 80 * 30 = 2400, so the 2000/mo listing stays eligible under an $80/night budget.
    expect(priceClause).toContain("price_daily.lte.80");
    expect(priceClause).toContain("price_monthly.lte.2400");
  });

  it("still applies the budget to both price columns", async () => {
    const { searchRentals } = await import("../search-rentals");

    const result = await searchRentals({
      neighborhood: "Laureles",
      maxPricePerNight: 60,
      limit: 10,
    });
    const ids = result.results.map((r) => r.id);

    // 78/night and 2000/mo (=2400 cap) both exceed a $60 budget.
    expect(ids).not.toContain("apt-nightly");
    expect(ids).not.toContain("apt-monthly");
    expect(ids).not.toContain("apt-unpriced");
  });
});
