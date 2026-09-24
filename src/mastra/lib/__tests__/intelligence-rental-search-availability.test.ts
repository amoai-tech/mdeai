import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    apartmentProjection: "",
    errorTable: null as string | null,
    neighborhoodRow: null as { id: string; name: string } | null,
    profileRow: null as Record<string, unknown> | null,
  };

  const activeApartment = {
    id: "active-1",
    title: "Current Laureles Studio",
    neighborhood: "Laureles",
    bedrooms: 1,
    price_daily: 25,
    price_monthly: 650,
    wifi_speed: 100,
    amenities: ["wifi"],
    images: [],
    host_name: "Host",
    source_url: null,
    available_from: "2026-01-01",
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    slug: "active-1",
    latitude: 6.25,
    longitude: -75.59,
  };

  const hybridRows = [
    {
      id: "expired-1",
      title: "Expired Studio",
      description: null,
      neighborhood: "Laureles",
      city: "Medellín",
      price_monthly: 300,
      bedrooms: 1,
      bathrooms: 1,
      rating: 4.8,
      images: [],
      amenities: [],
      pet_friendly: false,
      furnished: true,
      status: "active",
      similarity: 0.95,
    },
    {
      id: "active-1",
      title: "Current Laureles Studio",
      description: null,
      neighborhood: "Laureles",
      city: "Medellín",
      price_monthly: 650,
      bedrooms: 1,
      bathrooms: 1,
      rating: 4.7,
      images: [],
      amenities: [],
      pet_friendly: false,
      furnished: true,
      status: "active",
      similarity: 0.9,
    },
  ];

  const makeThenable = (table: string, dataFactory: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    const pass = vi.fn(() => chain);
    Object.assign(chain, {
      select: vi.fn((projection: string) => {
        if (table === "apartments") state.apartmentProjection = projection;
        return chain;
      }),
      in: pass,
      or: pass,
      eq: pass,
      ilike: pass,
      limit: pass,
      maybeSingle: vi.fn(async () => {
        if (state.errorTable === table) {
          return { data: null, error: { message: `${table} unavailable`, code: "503" } };
        }
        if (table === "neighborhoods") return { data: state.neighborhoodRow, error: null };
        if (table === "neighborhood_profiles") return { data: state.profileRow, error: null };
        return { data: null, error: null };
      }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(
          state.errorTable === table
            ? { data: null, error: { message: `${table} unavailable`, code: "503" } }
            : { data: dataFactory(), error: null },
        ).then(resolve, reject),
    });
    return chain;
  };

  const client = {
    rpc: vi.fn(async () => ({ data: hybridRows, error: null })),
    from: vi.fn((table: string) => {
      if (table === "apartments") {
        return makeThenable(table, () => {
          const row = state.apartmentProjection.includes("price_monthly")
            ? activeApartment
            : { ...activeApartment, price_monthly: undefined };
          return [row];
        });
      }
      if (table === "rental_signals") return makeThenable(table, () => []);
      return makeThenable(table, () => []);
    }),
  };

  return { state, client };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks.client }));
vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerAnonEnv: () => ({ url: "https://example.supabase.co", anonKey: "anon" }),
}));
vi.mock("../query-embedding", () => ({
  embedQueryTextDetailed: vi.fn(async () => ({ ok: true, values: [0.1, 0.2] })),
  vectorLiteral: vi.fn(() => "[0.1,0.2]"),
}));

describe("searchRentalsIntelligent — SAN-1356 availability + monthly truth", () => {
  beforeEach(() => {
    mocks.state.apartmentProjection = "";
    mocks.state.errorTable = null;
    mocks.state.neighborhoodRow = null;
    mocks.state.profileRow = null;
  });
  it("drops expired hybrid rows and preserves stored monthly price", async () => {
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    const result = await searchRentalsIntelligent({
      queryText: "digital nomad rental",
      limit: 5,
    });

    expect(mocks.state.apartmentProjection).toContain("price_monthly");
    expect(result.results.map((row) => row.id)).toEqual(["active-1"]);
    expect(result.results[0]?.price_monthly).toBe(650);
  });

  it("keeps core results when rental signal enrichment fails", async () => {
    mocks.state.errorTable = "rental_signals";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    const result = await searchRentalsIntelligent({
      queryText: "digital nomad rental",
      limit: 5,
    });

    expect(result.results.map((row) => row.id)).toEqual(["active-1"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps core results when neighborhood enrichment fails", async () => {
    mocks.state.errorTable = "neighborhoods";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    const result = await searchRentalsIntelligent({
      queryText: "quiet rental in Laureles",
      neighborhood: "Laureles",
      limit: 5,
    });

    expect(result.results.map((row) => row.id)).toEqual(["active-1"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps core results when neighborhood profile enrichment fails", async () => {
    mocks.state.neighborhoodRow = { id: "hood-1", name: "Laureles" };
    mocks.state.errorTable = "neighborhood_profiles";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    const result = await searchRentalsIntelligent({
      queryText: "quiet digital nomad rental in Laureles",
      neighborhood: "Laureles",
      limit: 5,
    });

    expect(result.results.map((row) => row.id)).toEqual(["active-1"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
