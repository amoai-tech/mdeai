/**
 * SAN-386 — a monthly budget must not let an uncomparable currency crowd the confirmed matches
 * out of the page. Reproduces the live shape: 5 COP rentals at ~2.1M/month inside a COP 3,000,000
 * budget, and 8 USD rentals whose raw monthly figures (1,300…) sort *before* 2,100,000 even though
 * the two amounts are not comparable. A nightly-first or raw-price sort returns 0 COP in the first
 * page; the confirmed-then-alternatives split must return all 5 first.
 */
import { describe, expect, it, vi } from "vitest";

const COP_COUNT = 5;
const USD_COUNT = 8;

const apartmentRows = [
  ...Array.from({ length: COP_COUNT }, (_, i) => ({
    id: `cop-${i + 1}-aaaaaaaa`,
    title: `COP ${i + 1}`,
    neighborhood: "Laureles",
    bedrooms: 2,
    price_daily: null,
    price_monthly: 2_100_000 + i * 10_000,
    currency: "COP",
    wifi_speed: 100,
    amenities: [],
    images: [],
    host_name: "Owner",
    source_url: null,
    metadata: {},
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    slug: `cop-${i + 1}`,
    latitude: 6.24,
    longitude: -75.58,
    status: "active",
    landlord_id: "lp-cop",
    moderation_status: "approved",
    listing_workflow_status: "published",
  })),
  ...Array.from({ length: USD_COUNT }, (_, i) => ({
    id: `usd-${i + 1}-bbbbbbbb`,
    title: `USD ${i + 1}`,
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: 50 + i,
    price_monthly: 1_300 + i,
    currency: "USD",
    wifi_speed: 100,
    amenities: [],
    images: [],
    host_name: "Host",
    source_url: null,
    metadata: {},
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    slug: `usd-${i + 1}`,
    latitude: 6.25,
    longitude: -75.58,
    status: "active",
    landlord_id: "lp-usd",
    moderation_status: "approved",
    listing_workflow_status: "published",
  })),
];

/** PostgREST stub: honours the currency split and the monthly ceiling, and reports full counts. */
function stub() {
  const conditions: Array<(row: Record<string, unknown>) => boolean> = [];
  let limit = Number.POSITIVE_INFINITY;
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      conditions.push((row) => String(row[column]) === String(value));
      return builder;
    },
    neq: (column: string, value: unknown) => {
      conditions.push((row) => String(row[column]) !== String(value));
      return builder;
    },
    not: () => builder,
    gte: () => builder,
    lte: () => builder,
    ilike: () => builder,
    or: (clause: string) => {
      conditions.push((row) => row.price_daily != null || row.price_monthly != null);
      const ceiling = /price_monthly\.lte\.(\d+)/.exec(clause);
      if (ceiling) {
        conditions.push(
          (row) => row.price_monthly != null && Number(row.price_monthly) <= Number(ceiling[1]),
        );
      }
      return builder;
    },
    order: () => builder,
    limit: (value: number) => {
      limit = value;
      return builder;
    },
    then: (resolve: (value: unknown) => unknown) => {
      const matched = apartmentRows.filter((row) =>
        conditions.every((matches) => matches(row as unknown as Record<string, unknown>)),
      );
      return Promise.resolve({
        data: matched.slice(0, limit),
        error: null,
        count: matched.length,
      }).then(resolve);
    },
  });
  return builder;
}

vi.mock("@/lib/rentals/public-external-discovery", () => ({
  searchPublicExternalRentals: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerUrl: () => "https://stub.supabase.co",
  getSupabaseServerAnonKey: () => "stub-anon-key",
  getSupabaseServerAnonEnv: () => ({ url: "https://stub.supabase.co", anonKey: "stub-anon-key" }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => stub() }),
}));

describe("a monthly budget never lets another currency crowd out the confirmed matches (SAN-386)", () => {
  it("returns the five COP matches before the eight USD alternatives", async () => {
    const { searchRentals } = await import("../search-rentals");
    const { results, total } = await searchRentals({
      neighborhood: "Laureles",
      maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP",
      limit: 8,
    });

    expect(results).toHaveLength(8);
    // The regression: before the split this page held 8 USD rows and 0 COP rows.
    expect(results.filter((r) => r.currency === "COP")).toHaveLength(COP_COUNT);
    expect(results.slice(0, COP_COUNT).every((r) => r.currency === "COP")).toBe(true);
    // The uncomparable alternatives remain visible, after the confirmed matches.
    expect(results.filter((r) => r.currency === "USD").length).toBeGreaterThan(0);
    expect(total).toBe(COP_COUNT + USD_COUNT);
  });
});
