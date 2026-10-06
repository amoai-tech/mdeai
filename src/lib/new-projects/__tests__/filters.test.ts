import { describe, expect, it } from "vitest";
import {
  applyProjectFilters,
  buildNewProjectsHref,
  countActiveFilters,
  parseProjectFilters,
  projectMatchesFilters,
} from "@/lib/new-projects/filters";
import type { NewProjectSummary } from "@/lib/new-projects/types";

function project(overrides: Partial<NewProjectSummary> = {}): NewProjectSummary {
  return {
    id: "p1",
    sourceKey: "medellin:new-project:arrayan",
    slug: "arrayan",
    name: "Arrayán",
    sourceOwner: "Amarilo",
    city: "Medellín",
    neighborhood: "Ciudad del Río",
    projectStatus: "pre_sale",
    priceFromCents: 57500000000,
    priceToCents: null,
    currency: "COP",
    expectedDeliveryYear: null,
    expectedDeliveryQuarter: null,
    deliveryNote: null,
    visFlag: false,
    verifiedAt: "2026-10-06T09:21:53Z",
    minBedrooms: 1,
    maxBedrooms: 3,
    unitTypeCount: 2,
    bedroomOptions: [
      { bedrooms: 1, priceFromCents: 57500000000 },
      { bedrooms: 3, priceFromCents: null },
    ],
    ...overrides,
  };
}

describe("parseProjectFilters", () => {
  it("accepts valid values", () => {
    expect(
      parseProjectFilters({
        neighborhood: "Laureles",
        maxPrice: "600000000",
        beds: "2",
        delivery: "2027",
      }),
    ).toEqual({
      neighborhood: "Laureles",
      maxPriceCop: 600000000,
      minBedrooms: 2,
      bedroomsExact: null,
      deliveryYear: 2027,
      deliveryUnknown: false,
    });
  });

  it("ignores malformed values instead of widening the search", () => {
    expect(
      parseProjectFilters({
        neighborhood: "Nowhere",
        maxPrice: "-5",
        beds: "9",
        delivery: "soon",
      }),
    ).toEqual({
      neighborhood: null,
      maxPriceCop: null,
      minBedrooms: null,
      bedroomsExact: null,
      deliveryYear: null,
      deliveryUnknown: false,
    });
  });

  it("recognises the delivery-unknown option", () => {
    expect(parseProjectFilters({ delivery: "unknown" }).deliveryUnknown).toBe(true);
  });
});

describe("projectMatchesFilters — hard deterministic filters", () => {
  it("matches neighborhood case-insensitively", () => {
    const filters = parseProjectFilters({ neighborhood: "ciudad del río" });
    expect(projectMatchesFilters(project(), filters)).toBe(true);
    expect(projectMatchesFilters(project({ neighborhood: "Laureles" }), filters)).toBe(false);
  });

  it("excludes a project with no published price from a price filter", () => {
    const filters = parseProjectFilters({ maxPrice: "600000000" });
    expect(projectMatchesFilters(project(), filters)).toBe(true);
    expect(
      projectMatchesFilters(project({ priceFromCents: 158700000000 }), filters),
    ).toBe(false);
    expect(projectMatchesFilters(project({ priceFromCents: null }), filters)).toBe(false);
  });

  it("matches \"2+ bedrooms\" against real typology options", () => {
    const filters = parseProjectFilters({ beds: "2" });
    expect(projectMatchesFilters(project(), filters)).toBe(true); // has a 3BR option
    expect(
      projectMatchesFilters(
        project({ maxBedrooms: 1, bedroomOptions: [{ bedrooms: 1, priceFromCents: 100 }] }),
        filters,
      ),
    ).toBe(false);
    expect(projectMatchesFilters(project({ bedroomOptions: [] }), filters)).toBe(false);
  });

  it("\"2 bedroom\" means exactly two, not two-or-more", () => {
    const exact = { ...parseProjectFilters({}), bedroomsExact: 2 };
    // 1BR + 3BR options exist, but no 2BR: exact-2 must fail where 2+ would pass.
    expect(projectMatchesFilters(project(), exact)).toBe(false);
    expect(
      projectMatchesFilters(
        project({ bedroomOptions: [{ bedrooms: 2, priceFromCents: null }] }),
        exact,
      ),
    ).toBe(true);
  });

  it("combines budget and bedrooms against ONE typology and fails closed on an unknown price", () => {
    const exactBudget = {
      ...parseProjectFilters({ maxPrice: "600000000" }),
      bedroomsExact: 2,
    };
    // A 2BR exists but its price is unknown, and a cheap 1BR must not satisfy "2BR under budget".
    const uncorrelated = project({
      priceFromCents: 50000000000,
      bedroomOptions: [
        { bedrooms: 1, priceFromCents: 50000000000 },
        { bedrooms: 2, priceFromCents: null },
      ],
    });
    expect(projectMatchesFilters(uncorrelated, exactBudget)).toBe(false);

    const correlated = project({
      priceFromCents: 90000000000,
      bedroomOptions: [
        { bedrooms: 1, priceFromCents: 50000000000 },
        { bedrooms: 2, priceFromCents: 58000000000 },
      ],
    });
    expect(projectMatchesFilters(correlated, exactBudget)).toBe(true);
  });

  it("locks the precedence: bedroomsExact wins when both are set by a direct caller", () => {
    const both = { ...parseProjectFilters({ beds: "3" }), bedroomsExact: 2 };
    expect(
      projectMatchesFilters(project({ bedroomOptions: [{ bedrooms: 2, priceFromCents: 1 }] }), both),
    ).toBe(true);
    // A 3BR-only project satisfies minBedrooms: 3, but exact-2 must win and reject it.
    expect(
      projectMatchesFilters(project({ bedroomOptions: [{ bedrooms: 3, priceFromCents: 1 }] }), both),
    ).toBe(false);
  });

  it("matches an exact delivery year and never a project without one", () => {
    const filters = parseProjectFilters({ delivery: "2027" });
    expect(projectMatchesFilters(project({ expectedDeliveryYear: 2027 }), filters)).toBe(true);
    expect(projectMatchesFilters(project({ expectedDeliveryYear: 2029 }), filters)).toBe(false);
    expect(projectMatchesFilters(project({ expectedDeliveryYear: null }), filters)).toBe(false);
  });

  it("treats a published delivery note as a known (estimated) date, not unknown", () => {
    const filters = parseProjectFilters({ delivery: "unknown" });
    expect(projectMatchesFilters(project(), filters)).toBe(true);
    expect(
      projectMatchesFilters(project({ deliveryNote: "Estimada" }), filters),
    ).toBe(false);
  });

  it("combines filters with AND", () => {
    const filters = parseProjectFilters({ neighborhood: "Laureles", beds: "2" });
    const results = applyProjectFilters(
      [
        project({
          slug: "a",
          neighborhood: "Laureles",
          bedroomOptions: [{ bedrooms: 1, priceFromCents: 1 }, { bedrooms: 3, priceFromCents: 1 }],
        }),
        project({
          slug: "b",
          neighborhood: "Laureles",
          bedroomOptions: [{ bedrooms: 1, priceFromCents: 1 }],
        }),
        project({
          slug: "c",
          neighborhood: "Ciudad del Río",
          bedroomOptions: [{ bedrooms: 1, priceFromCents: 1 }, { bedrooms: 3, priceFromCents: 1 }],
        }),
      ],
      filters,
    );
    expect(results.map((p) => p.slug)).toEqual(["a"]);
  });
});

describe("href building and active-filter count", () => {
  it("round-trips filters through the URL", () => {
    const filters = parseProjectFilters({ neighborhood: "Laureles", beds: "2" });
    expect(buildNewProjectsHref(filters)).toBe("/new-projects?neighborhood=Laureles&beds=2");
    expect(buildNewProjectsHref(parseProjectFilters({}))).toBe("/new-projects");
  });

  it("counts active filters", () => {
    expect(countActiveFilters(parseProjectFilters({}))).toBe(0);
    expect(countActiveFilters(parseProjectFilters({ delivery: "unknown" }))).toBe(1);
  });
});
