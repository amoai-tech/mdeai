import { describe, expect, it } from "vitest";
import {
  DATE_ERROR_NOT_REAL,
  DATE_ERROR_REVERSED,
  buildRentalsUrl,
  parseBrowseFilters,
  rentalsQueryString,
} from "@/lib/rentals/browse-filters";

describe("parseBrowseFilters (SAN-486)", () => {
  it("reads neighborhood, bedrooms and a real, ordered stay", () => {
    const { filters, dateError } = parseBrowseFilters({
      neighborhood: "Laureles", beds: "2", from: "2026-11-01", through: "2026-11-30",
    });
    expect(dateError).toBeNull();
    expect(filters).toEqual({ neighborhood: "Laureles", beds: "2", from: "2026-11-01", through: "2026-11-30" });
  });

  it("accepts a single date and a same-day stay", () => {
    expect(parseBrowseFilters({ from: "2026-11-01" }).dateError).toBeNull();
    expect(parseBrowseFilters({ through: "2026-11-30" }).dateError).toBeNull();
    expect(parseBrowseFilters({ from: "2026-11-01", through: "2026-11-01" }).dateError).toBeNull();
  });

  it.each(["2026-02-31", "2026-13-01", "tomorrow", "2026-1-5"])("refuses the impossible date %j and keeps no dates", (bad) => {
    for (const params of [{ from: bad }, { through: bad }, { from: "2026-11-01", through: bad }]) {
      const { filters, dateError } = parseBrowseFilters(params);
      expect(dateError).toBe(DATE_ERROR_NOT_REAL);
      expect(filters.from).toBeNull();
      expect(filters.through).toBeNull();
    }
  });

  it("refuses a reversed stay but keeps the typed dates so the form can show them", () => {
    const { filters, dateError } = parseBrowseFilters({ from: "2026-11-30", through: "2026-11-01" });
    expect(dateError).toBe(DATE_ERROR_REVERSED);
    expect(filters).toMatchObject({ from: "2026-11-30", through: "2026-11-01" });
  });

  it("ignores an out-of-range bedroom value, trims, and takes the first of a repeated parameter", () => {
    expect(parseBrowseFilters({ beds: "9" }).filters.beds).toBeNull();
    expect(parseBrowseFilters({ neighborhood: "  Envigado " }).filters.neighborhood).toBe("Envigado");
    expect(parseBrowseFilters({ from: ["2026-11-01", "2027-01-01"] }).filters.from).toBe("2026-11-01");
    expect(parseBrowseFilters({}).filters).toEqual({ neighborhood: null, beds: null, from: null, through: null });
  });
});

describe("rental browse URLs", () => {
  it("round-trips every filter through the URL", () => {
    const state = { neighborhood: "El Poblado", beds: "1", from: "2026-11-01", through: "2026-11-30" };
    const url = buildRentalsUrl(state);
    const params = Object.fromEntries(new URL(url, "http://x").searchParams);
    expect(parseBrowseFilters(params).filters).toEqual(state);
  });

  it("is a bare /rentals with nothing set, and omits empty values", () => {
    expect(buildRentalsUrl({})).toBe("/rentals");
    expect(rentalsQueryString({ neighborhood: null, from: "2026-11-01" })).toBe("?from=2026-11-01");
  });
});
