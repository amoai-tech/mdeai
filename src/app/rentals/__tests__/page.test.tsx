/**
 * SAN-1089 — /rentals must (a) never forward a USD/night cap into a COP/month marketplace,
 * even from an old bookmarked ?maxPrice=, and (b) say "unavailable" on an outage instead of
 * rendering demo cards or "0 apartments".
 */
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";

const searchRentals = vi.fn();

vi.mock("@/mastra/tools/search-rentals", () => ({
  searchRentals: (...args: unknown[]) => searchRentals(...args),
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
  maxPrice?: unknown;
};

async function render(params: Record<string, string>) {
  const element = (await RentalsPage({ searchParams: Promise.resolve(params) })) as ReactElement;
  return element.props as ViewProps;
}

beforeEach(() => {
  searchRentals.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/rentals page", () => {
  it("does not forward a stale ?maxPrice= as a nightly cap", async () => {
    searchRentals.mockResolvedValue({ results: [], total: 0, source: "supabase" });
    const props = await render({ maxPrice: "75", neighborhood: "Laureles", beds: "2" });
    const call = searchRentals.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("maxPricePerNight");
    expect(call.neighborhood).toBe("Laureles");
    expect(call.minBedrooms).toBe(2);
    expect(props.maxPrice).toBeUndefined();
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
});
