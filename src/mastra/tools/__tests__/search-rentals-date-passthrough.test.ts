/**
 * Isolated pass-through test: verifies searchRentals forwards checkIn/checkOut/stayType
 * to searchRentalsIntelligent when queryText is present.
 *
 * Must live in its own file so vi.mock is hoisted before any module is cached.
 *
 * Both seams below are stubbed so the fallback path is hermetic. Previously this test
 * reached the live database through searchRentalsFromSupabase(), so it passed only while
 * that database was unreachable (the throw fell through to MOCK_RENTALS) and failed in CI
 * once production held zero requestable listings. A test must not depend on how much
 * inventory production happens to have.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/intelligence-rental-search", () => ({
  searchRentalsIntelligent: vi.fn().mockResolvedValue({
    results: [],
    total: 0,
    source: "supabase" as const,
    hybridUsed: false,
    rankExplanation: [],
    slots: {},
  }),
  parseRentalIntelligenceSlots: vi.fn().mockReturnValue({}),
}));

/** Two Laureles rows and one elsewhere, so the neighbourhood filter is actually proven. */
const APARTMENT_ROWS = [
  {
    id: "apt-lau-1",
    title: "Bright 2BR in Laureles",
    neighborhood: "Laureles",
    bedrooms: 2,
    price_daily: 90,
    price_monthly: 2000,
    wifi_speed: 100,
    amenities: ["wifi", "workspace"],
    images: ["https://example.com/1.jpg"],
    host_name: "Host A",
    slug: "apt-lau-1",
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
    id: "apt-lau-2",
    title: "Studio in Laureles",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: 70,
    price_monthly: 1500,
    wifi_speed: 200,
    amenities: ["wifi"],
    images: [],
    host_name: "Host B",
    slug: "apt-lau-2",
    available_from: null,
    available_to: null,
    pet_friendly: true,
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
    id: "apt-pob-1",
    title: "Apartment in Poblado",
    neighborhood: "El Poblado",
    bedrooms: 3,
    price_daily: 150,
    price_monthly: 4000,
    wifi_speed: 300,
    amenities: ["wifi", "pool"],
    images: [],
    host_name: "Host C",
    slug: "apt-pob-1",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: true,
    minimum_stay_days: 2,
    latitude: 6.2088,
    longitude: -75.5674,
    status: "active",
    landlord_id: "lp-3",
    moderation_status: "approved",
    listing_workflow_status: "published",
  },
];

/**
 * Minimal in-memory stand-in for the Supabase query builder.
 *
 * Only the predicates this code path relies on are implemented, and only `ilike`
 * filters rows — enough to prove the neighbourhood filter works without reaching a
 * network. Every other builder method is accepted and ignored, so the stub does not
 * break when the real query gains a clause.
 */
function apartmentQueryStub(rows: Record<string, unknown>[]) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let limit: number | undefined;

  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    gte: () => builder,
    lte: () => builder,
    or: () => builder,
    order: () => builder,
    ilike: (column: string, pattern: string) => {
      const needle = pattern.replace(/%/g, "").toLowerCase();
      filters.push((row) => String(row[column]).toLowerCase().includes(needle));
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
  getSupabaseServerAnonEnv: () => ({ url: "https://stub.supabase.co", anonKey: "stub-anon-key" }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => apartmentQueryStub(APARTMENT_ROWS) }),
}));

describe("searchRentals — date params pass-through to intelligent path", () => {
  it("forwards checkIn/checkOut/stayType when queryText is present", async () => {
    const { searchRentalsIntelligent } = await import("../../lib/intelligence-rental-search");
    const { searchRentals } = await import("../search-rentals");

    await searchRentals({
      queryText: "digital nomad rental Laureles june 1 to 30",
      checkIn: "2026-06-01",
      checkOut: "2026-06-30",
      stayType: "monthly",
    });

    expect(searchRentalsIntelligent).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIn: "2026-06-01",
        checkOut: "2026-06-30",
        stayType: "monthly",
        queryText: "digital nomad rental Laureles june 1 to 30",
      }),
    );
  });

  it("falls back instead of throwing when intelligent search fails", async () => {
    const { searchRentalsIntelligent } = await import("../../lib/intelligence-rental-search");
    vi.mocked(searchRentalsIntelligent).mockRejectedValueOnce(
      new Error("intelligent layer unavailable"),
    );
    const { searchRentals } = await import("../search-rentals");

    const result = await searchRentals({
      queryText: "digital nomad rental in Laureles",
      neighborhood: "Laureles",
      limit: 5,
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThanOrEqual(5);
    // Proves the neighbourhood filter ran: the stub holds an El Poblado row too.
    expect(result.results.every((row) => row.neighborhood === "Laureles")).toBe(true);
  });

  it("does not call searchRentalsIntelligent when queryText is absent", async () => {
    const { searchRentalsIntelligent } = await import("../../lib/intelligence-rental-search");
    vi.mocked(searchRentalsIntelligent).mockClear();
    const { searchRentals } = await import("../search-rentals");

    // No queryText → goes to structured Supabase path, not intelligent path
    await searchRentals({ neighborhood: "Laureles", checkIn: "2026-06-01", checkOut: "2026-06-30" });

    expect(searchRentalsIntelligent).not.toHaveBeenCalled();
  });
});
