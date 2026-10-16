/**
 * SAN-486 — structured search applies the SAME availability rule as free-text search and the
 * viewing RPC: a listing with no move-in date is never offered, dated searches need full-stay coverage.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { filters: [] as string[], development: false };
  const chain: Record<string, unknown> = {};
  const pass = vi.fn(() => chain);
  Object.assign(chain, {
    select: pass, eq: pass, order: pass, limit: pass, ilike: pass, gte: pass, lte: pass,
    or: vi.fn((f: string) => { state.filters.push(`or(${f})`); return chain; }),
    not: vi.fn((c: string, o: string, v: unknown) => { state.filters.push(`not(${c},${o},${String(v)})`); return chain; }),
    then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject),
  });
  return { state, createClient: vi.fn(() => ({
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => ({ data: state.development, error: null })),
  })) };
});

// These tests exercise the canonical verified-inventory path only.
 // The separate source-linked public discovery path has its own regression tests.
vi.mock("@/lib/rentals/public-external-discovery", () => ({
  searchPublicExternalRentals: vi.fn().mockResolvedValue([]),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerAnonEnv: () => ({ url: "https://example.supabase.co", anonKey: "anon" }),
}));
vi.mock("../../lib/intelligence-rental-search", () => ({ searchRentalsIntelligent: vi.fn() }));

describe("searchRentals structured path — availability filter", () => {
  beforeEach(() => { mocks.state.filters = []; mocks.state.development = false; });

  it("never allows a listing with no move-in date, with a dated search", async () => {
    const { searchRentals } = await import("../search-rentals");
    await searchRentals({ neighborhood: "Laureles", checkIn: "2099-11-01", checkOut: "2099-11-30", limit: 5 });
    expect(mocks.state.filters).toContain("not(available_from,is,null)");
    expect(mocks.state.filters).toContain("or(available_from.lte.2099-11-01)");
    expect(mocks.state.filters).toContain("or(available_to.is.null,available_to.gte.2099-11-30)");
    expect(mocks.state.filters.some((f) => f.includes("available_from.is.null"))).toBe(false);
  });

  it("still honours explicit dates in development while keeping unconfirmed move-in dates discoverable", async () => {
    mocks.state.development = true;
    const { searchRentals } = await import("../search-rentals");
    await searchRentals({ neighborhood: "Laureles", checkIn: "2099-11-01",
      checkOut: "2099-11-30", limit: 5 });
    const availability = mocks.state.filters.join(" | ");
    // Unknown move-in dates stay discoverable (the card labels them "Availability unconfirmed") ...
    expect(mocks.state.filters).not.toContain("not(available_from,is,null)");
    expect(availability).toContain("available_from.is.null");
    // ... but a KNOWN date must still cover the whole requested stay (1–30 Nov = 30 days), and an
    // unknown start must still respect the known end date and the stay length.
    expect(availability).toContain("or(available_from.is.null,available_from.lte.2099-11-01)");
    expect(availability).toContain("available_from.lte.2099-11-01");
    expect(availability).toContain("available_to.gte.2099-11-30");
    expect(availability).toContain("minimum_stay_days.lte.30");
    expect(availability).toContain("maximum_stay_days.gte.30");
  });

  it("shows unexpired listings without requiring move-in documentation when no dates are requested", async () => {
    const { searchRentals } = await import("../search-rentals");
    await searchRentals({ neighborhood: "Laureles", limit: 5 });
    expect(mocks.state.filters).not.toContain("not(available_from,is,null)");
    expect(mocks.state.filters.some((f) => /^or\(available_to\.is\.null,available_to\.gte\.\d{4}-\d{2}-\d{2}\)$/.test(f))).toBe(true);
  });
});
