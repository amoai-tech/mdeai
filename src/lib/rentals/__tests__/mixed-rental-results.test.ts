import { afterEach, describe, expect, it, vi } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";

const h = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/lib/rentals/public-external-discovery", () => ({
  searchPublicExternalRentals: h.search,
}));
import { getOptionalExternalRentals, mixRentalResults } from "../mixed-rental-results";

function rental(
  id: string,
  source_url: string,
  tags: string[] = [],
): Rental {
  return {
    id, title: "Apartment " + id, neighborhood: "Laureles",
    bedrooms: 2, nightly_price: 0, price_monthly: 3_000_000, currency: "COP",
    amenities: [], wifi: false, image: "", host_name: "External",
    availability: "2026-10-14", tags, latitude: 6.24, longitude: -75.58,
    source_url, can_schedule_viewing: false, schedule_viewing_url: null,
  };
}
const canonical = (i: number) => rental("verified-" + i, "https://example.com/canonical/" + i);
const external = (i: number) => rental("candidate-" + i,
  "https://www.fincaraiz.com.co/apartamento/" + i, ["external-source"]);

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("mixed verified and source-linked rentals", () => {
  it("alternates sources with verified first so externals remain visible at limits 5 and 8", () => {
    const c = Array.from({ length: 9 }, (_, i) => canonical(i));
    const e = Array.from({ length: 9 }, (_, i) => external(i));
    for (const limit of [5, 8]) {
      const { results, distinctExternal } = mixRentalResults(c, e, limit);
      expect(results).toHaveLength(limit);
      expect(results[0].id).toBe("verified-0");
      expect(results[1].id).toBe("candidate-0");
      expect(results.filter((x) => x.tags.includes("external-source"))).toHaveLength(Math.floor(limit / 2));
      expect(distinctExternal).toBe(9);
    }
  });

  it("deduplicates by source identity even with changed www and tracking parameters", () => {
    const approved = rental("verified-id", "https://fincaraiz.com.co/apartamento/193916988");
    const duplicate = rental("candidate-id", "https://www.fincaraiz.com.co/apartamento/193916988?ref=tracking", ["external-source"]);
    const other = external(2);
    const mixed = mixRentalResults([approved], [duplicate, other], 5);
    expect(mixed.results.map((row) => row.id)).toEqual(["verified-id", "candidate-2"]);
    expect(mixed.distinctExternal).toBe(1);
  });

  it("keeps all external entries when canonical search returns no inventory", () => {
    expect(mixRentalResults([], Array.from({ length: 9 }, (_, i) => external(i)), 8).results).toHaveLength(8);
  });
});

describe("optional external lookup isolation", () => {
  it("returns [] and logs only a stable reason if external lookup throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h.search.mockRejectedValueOnce(new Error("secret-db-string"));
    expect(await getOptionalExternalRentals({ limit: 8 })).toEqual([]);
    expect(warn).toHaveBeenCalledWith("[search-rentals] optional external discovery unavailable");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-db-string");
    warn.mockRestore();
  });

  it("times out a stalled optional lookup without holding the canonical response", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h.search.mockImplementationOnce(() => new Promise<Rental[]>(() => undefined));
    const promise = getOptionalExternalRentals({ limit: 8 });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await promise).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("excludes COP/month external ads when a USD/night cap is supplied", async () => {
    expect(await getOptionalExternalRentals({ maxPricePerNight: 80, limit: 8 })).toEqual([]);
    expect(h.search).not.toHaveBeenCalled();
  });
});
