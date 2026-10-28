/**
 * SAN-1089 — /rentals must (a) never forward a USD/night cap into a COP/month marketplace,
 * even from an old bookmarked ?maxPrice=, and (b) say "unavailable" on an outage instead of
 * rendering demo cards or "0 apartments".
 */
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";

const searchRentals = vi.fn();

vi.mock("@/mastra/tools/search-rentals", () => ({
  searchRentals: (...args: unknown[]) => searchRentals(...args),
}));
const createServerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createServerClient(...args),
}));
vi.mock("@/components/rentals/rental-browse-view", () => ({
  RentalBrowseView: () => null,
}));

import RentalsPage from "../page";

type ViewProps = {
  results: unknown[];
  total: number;
  error: string | null;
  neighborhood: string | null;
  beds: string | null;
  from?: string | null;
  through?: string | null;
  dateError?: string | null;
  maxPrice?: unknown;
};

async function render(params: Record<string, string>) {
  const element = (await RentalsPage({ searchParams: Promise.resolve(params) })) as ReactElement;
  return element.props as ViewProps;
}

beforeEach(() => {
  searchRentals.mockReset();
  createServerClient.mockReset().mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/rentals page", () => {
  it("avoids remote Supabase on the existing deterministic browse-map test path", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
    const props = await render({});
    expect(createServerClient).not.toHaveBeenCalled();
    expect(searchRentals).not.toHaveBeenCalled();
    expect(props).toMatchObject({ results: [], total: 0, error: null });
  });

  it("never bypasses the real rental search in production even if an E2E flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    await render({});
    expect(createServerClient).toHaveBeenCalledOnce();
    expect(searchRentals).toHaveBeenCalledOnce();
  });

  it("does not forward a stale ?maxPrice= as a nightly cap", async () => {
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    const props = await render({ maxPrice: "75", neighborhood: "Laureles", beds: "2" });
    const call = searchRentals.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("maxPricePerNight");
    expect(call.neighborhood).toBe("Laureles");
    expect(call.minBedrooms).toBe(2);
    expect(props.maxPrice).toBeUndefined();
  });

  it("requests enough results to show the whole development catalogue", async () => {
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    await render({});
    const call = searchRentals.mock.calls[0]?.[0] as Record<string, unknown>;
    // The old 24-result cap hid ten published Rentberry development listings.
    expect(call.limit).toBeGreaterThanOrEqual(50);
  });

  it("reports an outage as an error with no results and no count", async () => {
    searchRentals.mockRejectedValue(new RentalSearchUnavailableError("client_unavailable"));
    const props = await render({});
    expect(props.error).toMatch(/temporarily unavailable/i);
    expect(props.results).toEqual([]);
  });

  it("a genuine zero is NOT an error", async () => {
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    const props = await render({});
    expect(props.error).toBeNull();
    expect(props.total).toBe(0);
  });

  it("does not write a raw driver message to the server log", async () => {
    searchRentals.mockRejectedValue(new Error("connection refused to db.prod.internal:5432"));
    const props = await render({});
    expect(props.error).toMatch(/temporarily unavailable/i);
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join(" | ");
    expect(logged).not.toContain("db.prod.internal");
  });

  describe("From/Through dates in the URL (SAN-486)", () => {
    it("forwards a real stay to the search as checkIn/checkOut and echoes it to the view", async () => {
      searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
      const props = await render({ from: "2026-11-01", through: "2026-11-30", neighborhood: "Laureles" });
      expect(searchRentals).toHaveBeenCalledWith(
        expect.objectContaining({ checkIn: "2026-11-01", checkOut: "2026-11-30", neighborhood: "Laureles" }),
        expect.objectContaining({ client: expect.anything() }),
      );
      expect(props).toMatchObject({ from: "2026-11-01", through: "2026-11-30", dateError: null });
    });

    it.each([
      ["an impossible date", { from: "2026-02-31" }],
      ["a reversed stay", { from: "2026-11-30", through: "2026-11-01" }],
    ])("fails closed on %s: shows the message and runs no search", async (_why, params) => {
      const props = await render(params);
      expect(searchRentals).not.toHaveBeenCalled();
      expect(props.dateError).toMatch(/./);
      expect(props.results).toEqual([]);
      expect(props.error).toBeNull(); // a date problem is not an outage
    });

    it("without dates the search carries no date filter", async () => {
      searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
      await render({ neighborhood: "Envigado" });
      const call = searchRentals.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.checkIn).toBeUndefined();
      expect(call.checkOut).toBeUndefined();
    });
  });
});

