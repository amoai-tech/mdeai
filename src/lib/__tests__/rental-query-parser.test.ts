import { describe, expect, it } from "vitest";
import { scoreRentalQuery, buildRentalSearchParams } from "@/lib/rental-query-parser";

describe("rental-query-parser — budget wording", () => {
  it("parses '$80/night' as nightly with neighborhood + bedrooms", () => {
    const s = scoreRentalQuery("1BR in Laureles under $80/night");
    expect(s.budgetType).toBe("nightly");
    expect(s.maxPricePerNight).toBe(80);
    expect(s.minBedrooms).toBe(1);
    expect(s.neighborhood).toBe("Laureles");
  });

  it("parses '$500/night' as a nightly price", () => {
    const s = scoreRentalQuery("$500/night rental in Laureles");
    expect(s.budgetType).toBe("nightly");
    expect(s.maxPricePerNight).toBe(500);
  });

  // Regression: "a night" / "nightly" must behave like "/night", not be
  // misread as monthly by the bare large-amount heuristic.
  it("parses '$500 a night' as nightly, not monthly", () => {
    const s = scoreRentalQuery("$500 a night rental in Laureles");
    expect(s.budgetType).toBe("nightly");
    expect(s.maxPricePerNight).toBe(500);
  });

  it("parses '$500 nightly' as nightly, not monthly", () => {
    const s = scoreRentalQuery("$500 nightly in El Poblado");
    expect(s.budgetType).toBe("nightly");
    expect(s.maxPricePerNight).toBe(500);
  });

  it("still treats an explicit monthly amount as monthly", () => {
    const s = scoreRentalQuery("$2000 per month in El Poblado");
    expect(s.budgetType).toBe("monthly");
  });
});

describe("rental-query-parser — INT-002 hero monthly + dates + city", () => {
  it("hero query gets clarify band not generic-only budget", () => {
    const s = scoreRentalQuery("list rentals in june 1 to 30 $1000 medellin");
    expect(s.budgetType).toBe("monthly");
    expect(s.hasDateRange).toBe(true);
    expect(s.cityWide).toBe(true);
    expect(s.confidence).toBeGreaterThanOrEqual(0.72);
    expect(s.confidence).toBeLessThan(0.85);
  });

  it("Laureles + nightly stays fast-path eligible", () => {
    const s = scoreRentalQuery("1BR in Laureles under $80/night");
    expect(s.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("Provenza maps to El Poblado neighborhood", () => {
    const s = scoreRentalQuery("2BR provenza under $120/night");
    expect(s.neighborhood).toBe("El Poblado");
  });
});

describe("rental-query-parser — INT-002 multi-vertical hero queries", () => {
  it("digital nomad rental Laureles — nomad + neighborhood band", () => {
    const s = scoreRentalQuery(
      "Find a quiet digital nomad rental in Laureles near cafes",
    );
    expect(s.neighborhood).toBe("Laureles");
    expect(s.hasNomad).toBe(true);
    expect(s.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it("monthly stay Poblado — monthly budget + neighborhood", () => {
    const s = scoreRentalQuery("monthly stay in El Poblado under $2000 per month");
    expect(s.neighborhood).toBe("El Poblado");
    expect(s.budgetType).toBe("monthly");
    expect(s.confidence).toBeGreaterThanOrEqual(0.76);
  });

  it("SAN-823: apartments in laureles — neighborhood + rental intent band", () => {
    const s = scoreRentalQuery("apartments in laureles");
    expect(s.neighborhood).toBe("Laureles");
    expect(s.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("quiet rental near cafes and gyms — vibe + proximity", () => {
    const s = scoreRentalQuery("quiet rental in Laureles near cafes and gyms");
    expect(s.neighborhood).toBe("Laureles");
    expect(s.hasCafeOrGym).toBe(true);
    expect(s.confidence).toBeGreaterThanOrEqual(0.62);
  });
});

describe("rental-query-parser — SAN-1356 neighborhood typo normalization", () => {
  it("normalizes 'laureless' to 'Laureles'", () => {
    const s = scoreRentalQuery("search top 5 rentals laureless");
    expect(s.neighborhood).toBe("Laureles");
  });

  it("normalizes 'laureless' with other filters", () => {
    const s = scoreRentalQuery("1BR in laureless under $80/night");
    expect(s.neighborhood).toBe("Laureles");
    expect(s.minBedrooms).toBe(1);
    expect(s.maxPricePerNight).toBe(80);
  });
});

describe("rental-query-parser — SAN-1356 explicit result count (top N)", () => {
  it("parses 'top 5' as explicitLimit = 5", () => {
    const s = scoreRentalQuery("search top 5 rentals laureles");
    expect(s.explicitLimit).toBe(5);
  });

  it("parses 'show 3' as explicitLimit = 3", () => {
    const s = scoreRentalQuery("show 3 apartments in laureles");
    expect(s.explicitLimit).toBe(3);
  });

  it("parses 'find 10' as explicitLimit = 10", () => {
    const s = scoreRentalQuery("find 10 rentals in poblado");
    expect(s.explicitLimit).toBe(10);
  });

  it("clamps explicit limit to max 20", () => {
    const s = scoreRentalQuery("top 50 rentals in laureles");
    expect(s.explicitLimit).toBe(20);
  });

  it("ignores 'top 0' as invalid (returns undefined)", () => {
    const s = scoreRentalQuery("top 0 rentals in laureles");
    expect(s.explicitLimit).toBeUndefined();
  });

  it("uses explicit limit in buildRentalSearchParams", () => {
    const params = buildRentalSearchParams("search top 5 rentals laureles", {});
    expect(params?.limit).toBe(5);
  });

  it("falls back to FAST_PATH_LIMIT when no explicit limit", () => {
    const params = buildRentalSearchParams("1BR in laureles under $80/night", {});
    expect(params?.limit).toBe(8);
  });

  it("first and second identical query produce identical semantics", () => {
    const memory = { lastRentalQuery: { neighborhood: "Laureles", limit: 5, genericAskPending: false } };
    const params1 = buildRentalSearchParams("search top 5 rentals laureles", memory);
    const params2 = buildRentalSearchParams("search top 5 rentals laureles", memory);
    expect(params1?.limit).toBe(params2?.limit);
    expect(params1?.neighborhood).toBe(params2?.neighborhood);
  });
});
