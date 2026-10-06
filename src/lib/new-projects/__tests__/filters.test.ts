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
    unitTypeCount: 6,
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

  it("requires the maximum known bedrooms to reach the requested minimum", () => {
    const filters = parseProjectFilters({ beds: "3" });
    expect(projectMatchesFilters(project({ maxBedrooms: 3 }), filters)).toBe(true);
    expect(projectMatchesFilters(project({ maxBedrooms: 2 }), filters)).toBe(false);
    expect(projectMatchesFilters(project({ maxBedrooms: null }), filters)).toBe(false);
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
        project({ slug: "a", neighborhood: "Laureles", maxBedrooms: 3 }),
        project({ slug: "b", neighborhood: "Laureles", maxBedrooms: 1 }),
        project({ slug: "c", neighborhood: "Ciudad del Río", maxBedrooms: 3 }),
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
