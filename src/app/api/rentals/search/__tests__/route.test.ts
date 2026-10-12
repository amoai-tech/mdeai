/**
 * SAN-1089 — the fast-path API must tell an outage (non-2xx) apart from a genuine empty
 * marketplace (HTTP 200 + results: []). The chat fast path keys off this status.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";

const searchRentals = vi.fn();

vi.mock("@/mastra/tools/search-rentals", () => ({
  searchRentals: (...args: unknown[]) => searchRentals(...args),
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
});
