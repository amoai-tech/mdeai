import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { projection: "" };
  const row = {
    id: "apt-1",
    title: "Centro Budget Studio · 300 USD",
    neighborhood: "Centro",
    bedrooms: 1,
    price_daily: 18,
    price_monthly: 300,
    wifi_speed: 100,
    amenities: ["wifi"],
    images: [],
    host_name: "Host",
    source_url: null,
    available_from: "2026-04-25",
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    slug: "apt-1",
    latitude: 6.25,
    longitude: -75.57,
  };

  const chain: Record<string, unknown> = {};
  const passthrough = vi.fn(() => chain);
  Object.assign(chain, {
    select: vi.fn((projection: string) => {
      state.projection = projection;
      return chain;
    }),
    eq: passthrough,
    not: passthrough,
    order: passthrough,
    limit: passthrough,
    ilike: passthrough,
    gte: passthrough,
    lte: passthrough,
    or: passthrough,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const projectedRow = state.projection.includes("price_monthly")
        ? row
        : { ...row, price_monthly: undefined };
      return Promise.resolve({ data: [projectedRow], error: null, count: 1 }).then(resolve, reject);
    },
  });

  return {
    state,
    createClient: vi.fn(() => ({ from: vi.fn(() => chain) })),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerAnonEnv: () => ({ url: "https://example.supabase.co", anonKey: "anon" }),
}));
vi.mock("../../lib/intelligence-rental-search", () => ({
  searchRentalsIntelligent: vi.fn(),
}));

describe("searchRentals — SAN-1356 monthly price projection", () => {
  it("selects price_monthly so stored monthly rent reaches rental cards", async () => {
    const { searchRentals } = await import("../search-rentals");

    const result = await searchRentals({ neighborhood: "Centro", limit: 5 });

    expect(mocks.state.projection).toContain("price_monthly");
    expect(result.results[0]?.price_monthly).toBe(300);
  });

  it("preserves price_monthly through the Mastra tool output envelope", async () => {
    const { searchRentalsTool } = await import("../search-rentals");

    const result = (await searchRentalsTool.execute!(
      { neighborhood: "Centro", limit: 5 },
      {} as never,
    )) as { results: Array<{ price_monthly?: number }> };

    expect(result.results[0]?.price_monthly).toBe(300);
  });
});
