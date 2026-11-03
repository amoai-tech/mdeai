import { describe, expect, it } from "vitest";
import {
  budgetNotApplied,
  buildRentalSearchParams,
  scoreRentalQuery,
} from "@/lib/rental-query-parser";

describe("SAN-1502 postmerge — real COP monthly budget", () => {
  it.each([
    ["Furnished 2BR in Laureles under COP 3.5 million per month", 3_500_000],
    ["2BR Laureles under COP 4M/month", 4_000_000],
    ["apartments in Laureles up to 3.500.000 pesos/mes", 3_500_000],
    ["2BR Laureles bajo COP 3,5 millones por mes", 3_500_000],
  ])("preserves exact monthly COP budget: %s", (query, amount) => {
    const signals = scoreRentalQuery(query);
    expect(signals.maxPriceMonthly).toBe(amount);
    expect(signals.budgetCurrency).toBe("COP");
    const params = buildRentalSearchParams(query, {});
    expect(params?.maxPriceMonthly).toBe(amount);
    expect(params?.budgetCurrency).toBe("COP");
    expect(params?.maxPricePerNight).toBeUndefined();
    expect(params?.stayType).toBe("monthly");
  });

  it("reads a COP amount written in millions as a monthly budget, never a $2/night cap", () => {
    const text = "2BR in Laureles under 2 million pesos";
    const params = buildRentalSearchParams(text, {});
    // "2 million pesos" is a monthly COP budget, not two US dollars a night.
    expect(params?.maxPriceMonthly).toBe(2_000_000);
    expect(params?.budgetCurrency).toBe("COP");
    expect(params?.maxPricePerNight).toBeUndefined();
    expect(params?.stayType).toBe("monthly");
    expect(budgetNotApplied(text, params ?? {})).toBe(false);
  });

  it("applies the acceptance sentence without needing the word 'month'", () => {
    const text = "Find a 2-bedroom apartment in Laureles under COP 3 million.";
    const params = buildRentalSearchParams(text, {});
    expect(params).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP",
      stayType: "monthly",
    });
    expect(params?.maxPricePerNight).toBeUndefined();
    expect(budgetNotApplied(text, params ?? {})).toBe(false);
  });

  it("does not guess a monthly COP budget from an ambiguous small amount or a nightly phrase", () => {
    expect(
      buildRentalSearchParams("2BR in Laureles under COP 300,000", {})?.maxPriceMonthly,
    ).toBeUndefined();
    expect(
      buildRentalSearchParams("2BR in Laureles under COP 80/night", {})?.maxPriceMonthly,
    ).toBeUndefined();
  });

  it("still reads an explicit dollar amount with a magnitude", () => {
    expect(buildRentalSearchParams("1BR in Laureles under $2k/night", {})?.maxPricePerNight).toBe(2000);
  });

  it("does not tell a renter their monthly budget was ignored when the search applied it", () => {
    const text = "Furnished 2BR in Laureles under COP 3.5 million per month";
    const params = buildRentalSearchParams(text, {});
    expect(params?.maxPriceMonthly).toBe(3_500_000);
    expect(budgetNotApplied(text, params!)).toBe(false);
  });

  it("treats a nightly budget as applied", () => {
    const text = "1BR in Laureles under $80/night";
    const params = buildRentalSearchParams(text, {});
    expect(params?.maxPricePerNight).toBe(80);
    expect(budgetNotApplied(text, params!)).toBe(false);
  });

  it("still reports a stated budget the parser could not apply", () => {
    expect(budgetNotApplied("2BR in Laureles under $80/night", {})).toBe(true);
    expect(budgetNotApplied("2BR in Laureles", {})).toBe(false);
  });

  it("retains budget across neighborhood refinements", () => {
    const first = buildRentalSearchParams("2BR apartments in Laureles under COP 3.5 million per month", {});
    expect(first?.maxPriceMonthly).toBe(3_500_000);
    const second = buildRentalSearchParams("also in El Poblado", {
      lastRentalQuery: { ...first, genericAskPending: false },
    });
    expect(second?.maxPriceMonthly).toBe(3_500_000);
    expect(second?.budgetCurrency).toBe("COP");
  });

  it("never mis-groups a malformed thousands amount", () => {
    const params = buildRentalSearchParams("apartments in Laureles up to COP 3.50.000 per month", {});
    expect(params?.maxPriceMonthly).not.toBe(3_500_000);
  });

  it("does not turn USD nightly or vague cheap into COP monthly caps", () => {
    expect(buildRentalSearchParams("2BR Laureles under $80/night", {})?.maxPriceMonthly).toBeUndefined();
    expect(buildRentalSearchParams("cheap rentals in Laureles", {})?.maxPriceMonthly).toBeUndefined();
  });
});

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

  it("parses natural filler in 'show me 5 rentals'", () => {
    const s = scoreRentalQuery("show me 5 rentals in laureles");
    expect(s.explicitLimit).toBe(5);
  });

  it("does not treat a photo count as a rental result limit", () => {
    const s = scoreRentalQuery("show 3 photos of the apartment in laureles");
    expect(s.explicitLimit).toBeUndefined();
  });

  it("parses 'find 10' as explicitLimit = 10", () => {
    const s = scoreRentalQuery("find 10 rentals in poblado");
    expect(s.explicitLimit).toBe(10);
  });

  it("clamps explicit limit to max 20", () => {
    const s = scoreRentalQuery("top 50 rentals in laureles");
    expect(s.explicitLimit).toBe(20);
  });

  it("clamps three-digit explicit limits to max 20", () => {
    const s = scoreRentalQuery("top 100 rentals in laureles");
    expect(s.explicitLimit).toBe(20);
  });

  it("clamps four-digit explicit limits to max 20", () => {
    const s = scoreRentalQuery("top 1000 rentals in laureles");
    expect(s.explicitLimit).toBe(20);
  });

  it("clamps six-digit explicit limits to max 20", () => {
    const s = scoreRentalQuery("top 999999 rentals in laureles");
    expect(s.explicitLimit).toBe(20);
  });

  it("ignores 'top 0' as invalid (returns undefined)", () => {
    const s = scoreRentalQuery("top 0 rentals in laureles");
    expect(s.explicitLimit).toBeUndefined();
  });

  it("does not turn a restaurant-style 'show 5 places' request into rental params", () => {
    const params = buildRentalSearchParams("show 5 places to eat in Laureles", {});
    expect(params).toBeNull();
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

describe("rental-query-parser — refinements keep the applied budget", () => {
  it("preserves a monthly ceiling when the next message only refines the neighborhood", () => {
    const params = buildRentalSearchParams("only Laureles", {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 2_000_000,
        budgetCurrency: "COP",
        budgetType: "monthly",
      },
    });
    expect(params?.maxPriceMonthly).toBe(2_000_000);
    expect(params?.budgetCurrency).toBe("COP");
    expect(params?.maxPricePerNight).toBeUndefined();
    expect(params?.stayType).toBe("monthly");
  });

  it("drops the stored monthly ceiling when the renter asks for a nightly budget", () => {
    const params = buildRentalSearchParams("actually under $80 per night", {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 2_000_000,
        budgetCurrency: "COP",
        budgetType: "monthly",
      },
    });
    expect(params?.maxPricePerNight).toBe(80);
    expect(params?.maxPriceMonthly).toBeUndefined();
    expect(params?.budgetCurrency).toBeUndefined();
  });
});

describe("rental-query-parser — a new budget always replaces the stored one", () => {
  it("clears a stored monthly ceiling when the renter asks for a whole-trip budget", () => {
    const params = buildRentalSearchParams("2BR in Laureles under $2000 total for the trip", {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 2_000_000,
        budgetCurrency: "COP",
        budgetType: "monthly",
      },
    });
    expect(params?.stayType).toBe("total_trip");
    expect(params?.maxPriceMonthly).toBeUndefined();
    expect(params?.budgetCurrency).toBeUndefined();
    expect(params?.maxPricePerNight).toBeUndefined();
  });

  it("clears a stored nightly cap when the renter asks for a monthly budget", () => {
    const params = buildRentalSearchParams("2BR in Laureles under COP 3 million per month", {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPricePerNight: 80,
        budgetType: "nightly",
      },
    });
    expect(params?.maxPriceMonthly).toBe(3_000_000);
    expect(params?.budgetCurrency).toBe("COP");
    expect(params?.maxPricePerNight).toBeUndefined();
    expect(params?.stayType).toBe("monthly");
  });
});

describe("rental-query-parser — vague preferences keep the saved ceiling", () => {
  it("keeps a saved monthly ceiling for 'affordable apartments in Laureles'", () => {
    const params = buildRentalSearchParams("affordable apartments in Laureles", {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 2_000_000,
        budgetCurrency: "COP",
        budgetType: "monthly",
      },
    });
    expect(params?.maxPriceMonthly).toBe(2_000_000);
    expect(params?.budgetCurrency).toBe("COP");
    expect(params?.stayType).toBe("monthly");
  });

  it("keeps a saved nightly ceiling for 'budget apartments in Laureles'", () => {
    const params = buildRentalSearchParams("budget apartments in Laureles", {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPricePerNight: 80,
        budgetType: "nightly",
      },
    });
    expect(params?.maxPricePerNight).toBe(80);
    expect(params?.maxPriceMonthly).toBeUndefined();
  });
});

describe("rental-query-parser — explicit replacements that cannot be applied", () => {
  it("clears a saved monthly ceiling for a euro budget the parser cannot apply", () => {
    const text = "my budget is €1500 per month";
    const params = buildRentalSearchParams(text, {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 2_000_000,
        budgetCurrency: "COP",
        budgetType: "monthly",
      },
    });
    expect(params?.maxPriceMonthly).toBeUndefined();
    expect(params?.budgetCurrency).toBeUndefined();
    expect(budgetNotApplied(text, params ?? {})).toBe(true);
  });

  it("clears the saved ceiling in a whole-city refinement with a new unparsable budget", () => {
    const text = "anywhere in Medellín under €1500 per month";
    const params = buildRentalSearchParams(text, {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 2_000_000,
        budgetCurrency: "COP",
        budgetType: "monthly",
      },
    });
    expect(params?.maxPriceMonthly).toBeUndefined();
    expect(params?.budgetCurrency).toBeUndefined();
    expect(budgetNotApplied(text, params ?? {})).toBe(true);
  });

  it("keeps the saved ceiling for a whole-city reply with no new budget", () => {
    const params = buildRentalSearchParams("anywhere is fine", {
      lastRentalQuery: {
        neighborhood: "Laureles",
        minBedrooms: 2,
        maxPriceMonthly: 2_000_000,
        budgetCurrency: "COP",
        budgetType: "monthly",
      },
    });
    expect(params?.maxPriceMonthly).toBe(2_000_000);
    expect(params?.budgetCurrency).toBe("COP");
  });
});

describe("rental-query-parser — replacement and preference boundaries", () => {
  const monthlyMemory = {
    lastRentalQuery: {
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxPriceMonthly: 2_000_000,
      budgetCurrency: "COP" as const,
      budgetType: "monthly" as const,
    },
  };
  const nightlyMemory = {
    lastRentalQuery: {
      neighborhood: "Laureles",
      minBedrooms: 2,
      maxPricePerNight: 80,
      budgetType: "nightly" as const,
    },
  };

  it("does not mistake a bedroom number for an explicit replacement budget", () => {
    const params = buildRentalSearchParams("budget 2BR apartments in Laureles", monthlyMemory);
    expect(params?.maxPriceMonthly).toBe(2_000_000);
    expect(params?.budgetCurrency).toBe("COP");
    expect(params?.stayType).toBe("monthly");
  });

  it("keeps saved budget for a vague bedroom preference", () => {
    const params = buildRentalSearchParams("budget 2 bedrooms in Laureles", monthlyMemory);
    expect(params?.maxPriceMonthly).toBe(2_000_000);
    expect(params?.stayType).toBe("monthly");
  });

  it("clears an obsolete nightly stay type after an unsupported euro replacement", () => {
    const query = "anywhere in Medellín under €1500 per month";
    const params = buildRentalSearchParams(query, nightlyMemory);
    expect(params?.maxPricePerNight).toBeUndefined();
    expect(params?.maxPriceMonthly).toBeUndefined();
    expect(params?.stayType).toBeUndefined();
    expect(budgetNotApplied(query, params ?? {})).toBe(true);
  });

  it("clears an obsolete monthly stay type after an unsupported euro replacement", () => {
    const query = "my budget is €1500 per month";
    const params = buildRentalSearchParams(query, monthlyMemory);
    expect(params?.maxPriceMonthly).toBeUndefined();
    expect(params?.budgetCurrency).toBeUndefined();
    expect(params?.stayType).toBeUndefined();
  });

  it("still retains stay type when the renter only widens to the entire city", () => {
    const params = buildRentalSearchParams("anywhere is fine", nightlyMemory);
    expect(params?.maxPricePerNight).toBe(80);
    expect(params?.stayType).toBe("nightly");
  });
});
