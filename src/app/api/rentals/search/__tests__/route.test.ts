/**
 * SAN-1089 — the fast-path API must tell an outage (non-2xx) apart from a genuine empty
 * marketplace (HTTP 200 + results: []). The chat fast path keys off this status.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRentalSearchParams } from "@/lib/rental-query-parser";
import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";

const searchRentals = vi.fn();

vi.mock("@/mastra/tools/search-rentals", () => ({
  searchRentals: (...args: unknown[]) => searchRentals(...args),
}));
const createServerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createServerClient(...args),
}));
vi.mock("@/lib/api-ip-rate-limit", () => ({
  checkSearchFastPathRateLimit: () => null,
}));

import { POST } from "../route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/rentals/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  searchRentals.mockReset();
  createServerClient.mockReset().mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/rentals/search", () => {
  it("returns 200 with results: [] for a genuinely empty marketplace", async () => {
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    const res = await POST(post({ limit: 8 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.source).toBe("supabase");
  });

  it("passes through the currency mismatch explanation for monthly COP inventory", async () => {
    const budgetNote = "External advertisements priced in COP/month are excluded from USD/night budget searches.";
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase", budgetNote });
    const res = await POST(post({ maxPricePerNight: 80, limit: 8 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.budgetNote).toBe(budgetNote);
    expect(searchRentals).toHaveBeenCalledWith(
      expect.objectContaining({ maxPricePerNight: 80 }),
      expect.objectContaining({ client: expect.anything() }),
    );
  });

  it("forwards a precise COP monthly ceiling to existing search", async () => {
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    const res = await POST(post({
      neighborhood: "Laureles", minBedrooms: 2,
      maxPriceMonthly: 3_500_000, budgetCurrency: "COP", stayType: "monthly",
    }));
    expect(res.status).toBe(200);
    expect(searchRentals).toHaveBeenCalledWith(
      expect.objectContaining({ maxPriceMonthly: 3_500_000, budgetCurrency: "COP" }),
      expect.objectContaining({ client: expect.anything() }),
    );
  });

  it("forwards the monthly cap parsed from the renter's sentence", async () => {
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    const params = buildRentalSearchParams(
      "Find a 2-bedroom apartment in Laureles under COP 3 million.",
      {},
    );
    expect(params).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP",
      stayType: "monthly",
    });
    const res = await POST(post(params));
    expect(res.status).toBe(200);
    expect(searchRentals).toHaveBeenCalledWith(
      expect.objectContaining({
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 3_000_000,
        budgetCurrency: "COP",
        stayType: "monthly",
      }),
      expect.objectContaining({ client: expect.anything() }),
    );
  });

  it("rejects a malformed currency at the HTTP boundary without searching", async () => {
    const res = await POST(post({
      maxPriceMonthly: 3_500_000,
      budgetCurrency: "COP) or price_monthly.lte.999999999",
    }));
    expect(res.status).toBe(400);
    expect(searchRentals).not.toHaveBeenCalled();
  });

  it("returns 503 rental_search_unavailable when the database cannot be read", async () => {
    searchRentals.mockRejectedValue(new RentalSearchUnavailableError("client_unavailable"));
    const res = await POST(post({ limit: 8 }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("rental_search_unavailable");
    expect(json.results).toBeUndefined();
  });

  it("never leaks the internal reason to the caller", async () => {
    searchRentals.mockRejectedValue(new RentalSearchUnavailableError("secret-host.internal refused"));
    const res = await POST(post({ limit: 8 }));
    expect(JSON.stringify(await res.json())).not.toContain("secret-host");
  });

  it("returns 500 for an unexpected failure", async () => {
    searchRentals.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ limit: 8 }));
    expect(res.status).toBe(500);
  });

  describe("date validation (SAN-486)", () => {
    it.each([
      { why: "an impossible check-in", dates: { checkIn: "2026-02-31" } },
      { why: "an impossible check-out", dates: { checkOut: "2026-13-01" } },
      { why: "a reversed stay", dates: { checkIn: "2026-11-30", checkOut: "2026-11-01" } },
    ])("rejects $why with HTTP 400 and never searches", async ({ dates }) => {
      const res = await POST(post({ limit: 8, ...dates }));
      expect(res.status).toBe(400);
      expect(searchRentals).not.toHaveBeenCalled();
    });

    it("accepts a real, ordered stay and passes the dates through", async () => {
      searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
      const res = await POST(post({ limit: 8, checkIn: "2026-11-01", checkOut: "2026-11-30" }));
      expect(res.status).toBe(200);
      expect(searchRentals).toHaveBeenCalledWith(
        expect.objectContaining({ checkIn: "2026-11-01", checkOut: "2026-11-30" }),
        expect.objectContaining({ client: expect.anything() }),
      );
    });
  });
});
