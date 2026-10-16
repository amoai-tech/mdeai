/**
 * SAN-486 — free-text (intelligent) search and structured search must agree about a future
 * move-in date: shown as upcoming (never "Available now"), requestable only when the canonical
 * apartment row proves it, and a hybrid-only hit never gains a viewing action.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rowToRental, type ApartmentRow } from "../../tools/search-rentals";

const mocks = vi.hoisted(() => {
  const state = { aptRows: [] as Array<Record<string, unknown>>, hybridIds: [] as string[], filters: [] as string[] };
  const makeThenable = (dataFactory: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    const pass = vi.fn(() => chain);
    Object.assign(chain, {
      select: pass, in: pass, eq: pass, order: pass, ilike: pass, limit: pass,
      or: vi.fn((f: string) => { state.filters.push(`or(${f})`); return chain; }),
      not: vi.fn((c: string, o: string, v: unknown) => { state.filters.push(`not(${c},${o},${String(v)})`); return chain; }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
        Promise.resolve({ data: dataFactory(), error: null }).then(resolve, reject),
    });
    return chain;
  };
  const client = {
    rpc: vi.fn(async () => ({
      data: state.hybridIds.map((id, i) => ({
        id, title: id, description: null, neighborhood: "Laureles", city: "Medellín",
        price_monthly: 900, bedrooms: 1, bathrooms: 1, rating: null, images: [], amenities: [],
        pet_friendly: false, furnished: true, status: "active", similarity: 0.9 - i / 100,
      })),
      error: null,
    })),
    from: vi.fn((table: string) =>
      makeThenable(() => (table === "apartments" ? state.aptRows : [])),
    ),
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

const baseRow = (over: Record<string, unknown>) => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Upcoming Laureles 1BR",
  neighborhood: "Laureles",
  bedrooms: 1,
  price_daily: null,
  price_monthly: 900,
  currency: "USD",
  wifi_speed: null,
  amenities: [],
  images: [],
  host_name: null,
  source_url: null,
  available_to: null,
  pet_friendly: false,
  parking_included: false,
  minimum_stay_days: 30,
  slug: null,
  latitude: 6.25,
  longitude: -75.59,
  landlord_id: "c2cd8821-679b-408b-939a-3e77ba568c3c",
  status: "active",
  moderation_status: "approved",
  listing_workflow_status: "published",
  // SAN-1502: the database's computed column decides requestability.
  rental_can_request_viewing: true,
  ...over,
});

describe("searchRentalsIntelligent — future move-in (SAN-486)", () => {
  beforeEach(() => {
    mocks.state.aptRows = [];
    mocks.state.hybridIds = [];
    mocks.state.filters = [];
  });

  it("shows a future move-in as upcoming, requestable, and identical to the structured mapper", async () => {
    const row = baseRow({ available_from: "2099-11-01" });
    mocks.state.aptRows = [row];
    mocks.state.hybridIds = [row.id as string];
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    const { results } = await searchRentalsIntelligent({ queryText: "quiet 1BR in Laureles", limit: 5 });
    const free = results[0];
    const structured = rowToRental(row as unknown as ApartmentRow);

    expect(free.availability).toBe("Available from Nov 1, 2099");
    expect(free.availability).not.toMatch(/available now/i);
    expect(free.can_schedule_viewing).toBe(true);
    expect(free.schedule_viewing_url).not.toBeNull();
    // Same canonical mapper, so the two search paths cannot disagree.
    expect(free.availability).toBe(structured.availability);
    expect(free.can_schedule_viewing).toBe(structured.can_schedule_viewing);
    expect(free.schedule_viewing_url).toBe(structured.schedule_viewing_url);
  });

  it("offers no viewing when the database computed the listing not requestable", async () => {
    const row = baseRow({ available_from: null, rental_can_request_viewing: false });
    mocks.state.aptRows = [row];
    mocks.state.hybridIds = [row.id as string];
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    const { results } = await searchRentalsIntelligent({ queryText: "1BR in Laureles", limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].can_schedule_viewing).toBe(false);
    expect(results[0].schedule_viewing_url).toBeNull();
  });

  it("never returns a hybrid-only hit that has no canonical apartment row", async () => {
    mocks.state.aptRows = [];
    mocks.state.hybridIds = ["22222222-2222-4222-8222-222222222222"];
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    const { results } = await searchRentalsIntelligent({ queryText: "1BR in Laureles", limit: 5 });
    expect(results).toEqual([]);
  });

  it("applies the shared availability rule to the canonical lookup: a missing move-in date is never allowed", async () => {
    const row = baseRow({ available_from: "2099-11-01" });
    mocks.state.aptRows = [row];
    mocks.state.hybridIds = [row.id as string];
    const { searchRentalsIntelligent } = await import("../intelligence-rental-search");

    await searchRentalsIntelligent({ queryText: "1BR in Laureles", checkIn: "2099-11-01", checkOut: "2099-11-30", limit: 5 });
    expect(mocks.state.filters).toContain("not(available_from,is,null)");
    expect(mocks.state.filters).toContain("or(available_from.lte.2099-11-01)");
    expect(mocks.state.filters.some((f) => f.includes("available_from.is.null"))).toBe(false);
  });
});
