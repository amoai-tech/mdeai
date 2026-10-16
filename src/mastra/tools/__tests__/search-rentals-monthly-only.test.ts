/**
 * Regression tests for the two defects that emptied the rental marketplace.
 *
 * 1. **Presence.** Search required `price_daily IS NOT NULL`, but the only application write
 *    path (`src/lib/rentals/submit-broker-onboarding.ts`) stores `price_monthly`. Every
 *    listing the product could create was filtered out of search permanently.
 * 2. **Currency.** `rowToRental` hardcoded `currency: 'USD'` and the schema was a
 *    `z.literal('USD')`, so a 2,400,000 **COP** monthly rent was relabelled as a USD figure —
 *    and compared, raw, against a budget the tool schema documents as "USD per night".
 *
 * The rows below are deliberately realistic: COP values are in the millions, the way owner
 * onboarding actually stores them.
 */
import { describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

/** USD-scale nightly budget used throughout, matching `maxPricePerNight`'s documented unit. */
const mockApartmentRows = [
  {
    // The real Medellín shape: COP, monthly only, no nightly price.
    id: "apt-cop-monthly",
    title: "Calle 10 #42-15, Laureles",
    neighborhood: "Laureles",
    bedrooms: 2,
    price_daily: null,
    price_monthly: 2_400_000,
    currency: "COP",
    wifi_speed: 100,
    amenities: ["wifi"],
    images: [],
    host_name: "Owner",
    slug: "apt-cop-monthly",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    latitude: 6.2442,
    longitude: -75.5812,
    status: "active",
    landlord_id: "lp-1",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
  {
    id: "apt-usd-nightly",
    title: "Nightly-priced 1BR",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: 78,
    price_monthly: null,
    currency: "USD",
    wifi_speed: 100,
    amenities: ["wifi"],
    images: [],
    host_name: "Host B",
    slug: "apt-usd-nightly",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    latitude: 6.245,
    longitude: -75.582,
    status: "active",
    landlord_id: "lp-2",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
  {
    // Stored nightly beats a derived one: 9000/30 would be 300, but 78 is authoritative.
    id: "apt-usd-both",
    title: "Priced both ways",
    neighborhood: "Laureles",
    bedrooms: 3,
    price_daily: 78,
    price_monthly: 9000,
    currency: "USD",
    wifi_speed: 100,
    amenities: ["wifi"],
    images: [],
    host_name: "Host C",
    slug: "apt-usd-both",
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
  {
    // Boundary: round(2414 / 30) === 80, exactly the cap. 2415 rounds to 81.
    id: "apt-usd-boundary-in",
    title: "At the boundary",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: null,
    price_monthly: 2414,
    currency: "USD",
    wifi_speed: 100,
    amenities: [],
    images: [],
    host_name: "Host D",
    slug: "apt-usd-boundary-in",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    latitude: 6.247,
    longitude: -75.584,
    status: "active",
    landlord_id: "lp-4",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
  {
    id: "apt-usd-boundary-out",
    title: "Just past the boundary",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: null,
    price_monthly: 2415,
    currency: "USD",
    wifi_speed: 100,
    amenities: [],
    images: [],
    host_name: "Host E",
    slug: "apt-usd-boundary-out",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    latitude: 6.248,
    longitude: -75.585,
    status: "active",
    landlord_id: "lp-5",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
  {
    // Unpriced: must stay excluded, never rendered as 0/night.
    id: "apt-unpriced",
    title: "Unpriced listing",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: null,
    price_monthly: null,
    currency: "USD",
    wifi_speed: 100,
    amenities: [],
    images: [],
    host_name: "Host F",
    slug: "apt-unpriced",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    latitude: 6.249,
    longitude: -75.586,
    status: "active",
    landlord_id: "lp-6",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
];

/** The `or()` clauses the code emitted, so the predicate itself can be asserted. */
const mockEmittedOrClauses: string[] = [];

/**
 * Minimal stand-in for the Supabase query builder that actually EVALUATES the emitted price
 * predicate, so a surviving monthly-only COP row is real proof rather than a recorded string.
 * Availability clauses are accepted and ignored: these tests are about price and currency.
 *
 * It models only the operators the predicate can emit (`not.is.null`, `lte`, `eq`, `neq` inside
 * `and(...)`). `rental-price-predicate.postgrest.integration.test.ts` checks the same strings
 * against the real PostgREST parser, because a hand-written evaluator can drift from the real
 * grammar — and did: the first version of this fix omitted the wrapping parentheses and only
 * the live probe caught it.
 */
const orderCalls: Array<{ column: string; nullsFirst: boolean }> = [];

function mockApartmentQueryStub(rows: Record<string, unknown>[]) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let limit: number | undefined;

  const evaluateCondition = (row: Record<string, unknown>, condition: string): boolean => {
    const parts = condition.split(".");
    const actual = row[parts[0]];
    if (parts[1] === "not" && parts[2] === "is" && parts[3] === "null") {
      return actual !== null && actual !== undefined;
    }
    if (parts[1] === "is" && parts[2] === "null") {
      return actual === null || actual === undefined;
    }
    if (parts[1] === "lte") {
      if (actual === null || actual === undefined) return false;
      return Number(actual) <= Number(parts[2]);
    }
    if (parts[1] === "eq") return String(actual) === parts[2];
    if (parts[1] === "neq") return String(actual) !== parts[2];
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
    // Only the currency split matters to these tests; the other columns stay pass-through.
    eq: (column: string, value: unknown) => {
      if (column === "currency") filters.push((row) => String(row[column]) === String(value));
      return builder;
    },
    neq: (column: string, value: unknown) => {
      if (column === "currency") filters.push((row) => String(row[column]) !== String(value));
      return builder;
    },
    not: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: (column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
      orderCalls.push({ column, nullsFirst: opts?.nullsFirst ?? false });
      return builder;
    },
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

// These tests exercise the canonical verified-inventory path only.
 // The separate source-linked public discovery path has its own regression tests.
vi.mock("@/lib/rentals/public-external-discovery", () => ({
  searchPublicExternalRentals: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerUrl: () => "https://stub.supabase.co",
  getSupabaseServerAnonKey: () => "stub-anon-key",
  getSupabaseServerAnonEnv: () => ({ url: "https://stub.supabase.co", anonKey: "stub-anon-key" }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => mockApartmentQueryStub(mockApartmentRows) }),
}));

async function search(query: Record<string, unknown> = {}) {
  const { searchRentals } = await import("../search-rentals");
  orderCalls.length = 0;
  return searchRentals({ neighborhood: "Laureles", limit: 20, ...query });
}

describe("nightlyPriceFrom — one derivation for both search paths", () => {
  it("prefers a stored nightly price", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_daily: 78, price_monthly: 3000 })).toBe(78);
  });

  it("derives an indicative nightly from the monthly price owner onboarding writes", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_daily: null, price_monthly: 2400 })).toBe(80);
  });

  it("accepts the string numerics the hybrid row type carries", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_monthly: "2400" })).toBe(80);
  });

  it("returns 0 when neither price exists, which the query predicate makes unreachable", async () => {
    const { nightlyPriceFrom } = await import("../search-rentals");
    expect(nightlyPriceFrom({ price_daily: null, price_monthly: null })).toBe(0);
  });
});

describe("monthlyCeilingForNightlyCap — the filter agrees with the label it displays", () => {
  it("admits the largest monthly price that still rounds to the cap", async () => {
    const { monthlyCeilingForNightlyCap } = await import("../search-rentals");
    // round(2414 / 30) = 80 (the cap) but 2414 > 80 * 30, so a naive ceiling would drop it.
    expect(monthlyCeilingForNightlyCap(80)).toBe(2414);
    expect(Math.round(2414 / 30)).toBe(80);
    expect(Math.round(2415 / 30)).toBe(81);
  });
});

describe("rentalPricePredicate — budget is only applied within its own currency", () => {
  it("requires a price when no budget is given", async () => {
    const { rentalPricePredicate } = await import("../search-rentals");
    const clause = rentalPricePredicate(null);
    expect(clause).toBe("price_daily.not.is.null,price_monthly.not.is.null");
  });

  it("never compares a non-USD listing against the USD budget", async () => {
    const { rentalPricePredicate } = await import("../search-rentals");
    const clause = rentalPricePredicate(80);
    // Non-USD rows are matched by currency alone; no numeric comparison appears for them.
    expect(clause).toContain("and(currency.neq.USD,price_daily.not.is.null)");
    expect(clause).toContain("and(currency.neq.USD,price_monthly.not.is.null)");
    // Same-currency rows carry the comparison.
    expect(clause).toContain("and(currency.eq.USD,price_daily.not.is.null,price_daily.lte.80)");
    expect(clause).toContain(
      "and(currency.eq.USD,price_daily.is.null,price_monthly.not.is.null,price_monthly.lte.2414)",
    );
  });
});

describe("monthly budget PostgREST filter input safety", () => {
  it.each([
    "COP) or price_monthly.lte.999999999",
    "COP,price_monthly.lte.999999999",
    "COP.eq.USD",
    "COP%29",
    'COP"\\\\',
    "COP XYZ",
    "",
  ])("rejects malformed budgetCurrency %j before composing a filter", async (currency) => {
    const { rentalMonthlyBudgetPredicate, monthlyBudgetFromQuery, searchRentalsTool } =
      await import("../search-rentals");
    const currencyRule = /three-letter/;
    expect(() => rentalMonthlyBudgetPredicate(3_500_000, currency)).toThrow(currencyRule);
    expect(() => monthlyBudgetFromQuery({ maxPriceMonthly: 3_500_000, budgetCurrency: currency })).toThrow(currencyRule);
    // Mastra exposes its Zod input through a standard-schema type at compile time.
    const inputSchema = searchRentalsTool.inputSchema as unknown as ZodType;
    expect(inputSchema.safeParse({
      maxPriceMonthly: 3_500_000, budgetCurrency: currency,
    }).success).toBe(false);
  });

  it("normalizes an ordinary three-letter tool currency to uppercase", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const inputSchema = searchRentalsTool.inputSchema as unknown as ZodType;
    const parsed = inputSchema.safeParse({ maxPriceMonthly: 3_000_000, budgetCurrency: "cop" });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.budgetCurrency : undefined).toBe("COP");
  });

  it("allows ordinary three-letter currencies and preserves the original COP comparison", async () => {
    const { rentalMonthlyBudgetPredicate } = await import("../search-rentals");
    expect(rentalMonthlyBudgetPredicate(3_500_000, "cop")).toBe(
      "and(currency.neq.COP,price_daily.not.is.null)," +
      "and(currency.neq.COP,price_monthly.not.is.null)," +
      "and(currency.eq.COP,price_monthly.not.is.null,price_monthly.lte.3500000)",
    );
    expect(rentalMonthlyBudgetPredicate(1200, "USD")).toContain(
      "and(currency.eq.USD,price_monthly.not.is.null,price_monthly.lte.1200)",
    );
  });

  it("rejects a malicious currency before attempting intelligent or structured search", async () => {
    const { searchRentals } = await import("../search-rentals");
    await expect(searchRentals({
      queryText: "two-bedroom rental",
      maxPriceMonthly: 3_500_000,
      budgetCurrency: "COP) or price_monthly.lte.999999999",
    })).rejects.toThrow(/three-letter/);
    // Same rejection on the structured path, before any client or filter exists.
    await expect(searchRentals({
      maxPriceMonthly: 3_500_000,
      budgetCurrency: "COP) or price_monthly.lte.999999999",
    })).rejects.toThrow(/three-letter/);
  });

  it("rejects nonfinite or nonpositive monthly caps in the direct predicate", async () => {
    const { rentalMonthlyBudgetPredicate } = await import("../search-rentals");
    for (const amount of [Infinity, Number.NaN, -10, 0]) {
      expect(() => rentalMonthlyBudgetPredicate(amount, "COP")).toThrow(/finite positive/);
    }
  });
});

describe("searchRentals — a monthly budget confirms only same-currency matches", () => {
  it("keeps a COP monthly listing under a lowercase cop cap", async () => {
    const { MONTHLY_BUDGET_NOTE } = await import("../search-rentals");
    const result = await search({ maxPriceMonthly: 2_500_000, budgetCurrency: "cop" });
    expect(result.results.map((r) => r.id)).toContain("apt-cop-monthly");
    expect(result.budgetNote).toBe(MONTHLY_BUDGET_NOTE);
  });

  it("excludes a COP monthly listing above the cap and keeps other currencies as alternatives", async () => {
    const ids = (await search({ maxPriceMonthly: 2_000_000, budgetCurrency: "COP" })).results.map(
      (r) => r.id,
    );
    expect(ids).not.toContain("apt-cop-monthly");
    // A USD listing is retained as an uncompared alternative, never silently deleted.
    expect(ids).toContain("apt-usd-nightly");
  });

  it("applies a USD monthly cap only to USD monthly prices", async () => {
    const ids = (
      await search({ maxPriceMonthly: 2_414, budgetCurrency: "usd" })
    ).results.map((r) => r.id);
    expect(ids).toContain("apt-usd-boundary-in"); // 2414 <= 2414
    expect(ids).not.toContain("apt-usd-boundary-out"); // 2415 > 2414
    expect(ids).not.toContain("apt-usd-both"); // 9000 > 2414
    expect(ids).toContain("apt-cop-monthly"); // other currency: shown, not compared
  });
});

describe("searchRentals — monthly-only COP listings are findable and truthful", () => {
  it("1 · survives search with no nightly price", async () => {
    const ids = (await search()).results.map((r) => r.id);
    expect(ids).toContain("apt-cop-monthly");
  });

  it("2 · reports COP, not USD", async () => {
    const row = (await search()).results.find((r) => r.id === "apt-cop-monthly");
    expect(row?.currency).toBe("COP");
  });

  it("3 · derives 80,000 COP/night from 2,400,000 COP/month", async () => {
    const row = (await search()).results.find((r) => r.id === "apt-cop-monthly");
    expect(row?.nightly_price).toBe(80_000);
    expect(row?.price_monthly).toBe(2_400_000);
  });

  it("4 · is not dropped by a USD 80/night budget", async () => {
    // Raw comparison would be 2,400,000 <= 2414 → false, silently deleting the listing.
    const ids = (await search({ maxPricePerNight: 80 })).results.map((r) => r.id);
    expect(ids).toContain("apt-cop-monthly");
  });

  it("5 · includes unpriced inventory when no budget was requested", async () => {
    const results = (await search()).results;
    expect(results.map((r) => r.id)).toContain("apt-unpriced");
    const unknown = results.find((r) => r.id === "apt-unpriced");
    expect(unknown?.price_monthly).toBeUndefined();
    // Zero remains an internal schema placeholder, never a displayed rent.
    expect(unknown?.nightly_price).toBe(0);
  });

  it("6 · includes the boundary monthly price and excludes the next one, matching the label", async () => {
    const ids = (await search({ maxPricePerNight: 80 })).results.map((r) => r.id);
    expect(ids).toContain("apt-usd-boundary-in"); // 2414 → labelled 80/night, inside the cap
    expect(ids).not.toContain("apt-usd-boundary-out"); // 2415 → labelled 81/night, outside
  });

  it("7 · keeps the stored nightly price authoritative when both are present", async () => {
    const row = (await search()).results.find((r) => r.id === "apt-usd-both");
    expect(row?.nightly_price).toBe(78); // not 9000 / 30 === 300
    expect(row?.price_monthly).toBe(9000);
  });

  it("8 · still applies the budget to same-currency listings", async () => {
    const ids = (await search({ maxPricePerNight: 60 })).results.map((r) => r.id);
    expect(ids).not.toContain("apt-usd-nightly"); // 78/night > 60
    expect(ids).not.toContain("apt-usd-both"); // 78/night > 60
    expect(ids).toContain("apt-cop-monthly"); // not comparable, so not silently dropped
  });
});

describe("formatRentalPrices — the label carries the listing's currency", () => {
  it("labels a COP monthly rent in COP, never with a USD symbol", async () => {
    const { formatRentalPrices } = await import("@/lib/rental-display");
    expect(formatRentalPrices(80_000, 2_400_000, "COP")).toEqual({
      nightlyLabel: "COP 80,000/night",
      monthlyLabel: "COP 2,400,000/mo",
    });
  });

  it("leaves the USD catalogue's familiar symbol unchanged", async () => {
    const { formatRentalPrices } = await import("@/lib/rental-display");
    expect(formatRentalPrices(80, undefined, "USD")).toEqual({
      nightlyLabel: "$80/night",
      monthlyLabel: "~$2,400/mo",
    });
  });

  it("shows only the monthly price when there is no nightly price", async () => {
    const { formatRentalPrices } = await import("@/lib/rental-display");
    expect(formatRentalPrices(null, 2_400_000, "COP")).toEqual({
      nightlyLabel: null,
      monthlyLabel: "COP 2,400,000/mo",
    });
  });

  it("renders nothing rather than $0 when there is no price at all", async () => {
    const { formatRentalPrices } = await import("@/lib/rental-display");
    expect(formatRentalPrices(null, null, "COP")).toEqual({
      nightlyLabel: null,
      monthlyLabel: null,
    });
  });
});

describe("ordering must not truncate the matches a monthly budget asks for (SAN-386)", () => {
  it("orders the monthly figure first when a monthly budget is applied", async () => {
    await search({ maxPriceMonthly: 3_000_000, budgetCurrency: "COP" });
    // Monthly matches have no nightly price, so a nightly-first sort would push them past .limit().
    expect(orderCalls.map((o) => o.column)).toEqual(["price_monthly", "price_daily"]);
  });

  it("keeps the stored nightly order when no monthly budget is applied", async () => {
    await search({});
    expect(orderCalls.map((o) => o.column)).toEqual(["price_daily"]);
  });
});
