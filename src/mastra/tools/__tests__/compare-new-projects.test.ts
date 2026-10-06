import { describe, expect, it } from "vitest";
import { buildProjectComparison } from "@/mastra/tools/compare-new-projects";
import type {
  DevelopmentProjectRow,
  DevelopmentProjectSourceRow,
  DevelopmentUnitTypeRow,
} from "@/lib/new-projects/types";

function project(overrides: Partial<DevelopmentProjectRow> = {}): DevelopmentProjectRow {
  return {
    address: null, amenities: null, city: "Medellín", construction_progress: null,
    created_at: "2026-10-08T09:00:00Z", currency: "COP", delivery_note: null,
    expected_delivery_quarter: null, expected_delivery_year: null, id: "p1",
    latitude: null, longitude: null, name: "Arrayán", neighborhood: "Ciudad del Río",
    notes: null, ownership_status: "unclaimed", partner_id: null, payment_plan: null,
    price_from_cents: 57500000000, price_to_cents: null, primary_source_id: "s1",
    project_status: "pre_sale", publish_state: "published", slug: "arrayan",
    source_key: "medellin:new-project:arrayan", source_kind: "developer",
    source_owner: "Amarilo", source_url: null, updated_at: "2026-10-08T09:00:00Z",
    verified_at: "2026-10-06T09:21:53Z", vis_flag: false, ...overrides,
  };
}
function unit(overrides: Partial<DevelopmentUnitTypeRow> = {}): DevelopmentUnitTypeRow {
  return {
    availability: null, bathrooms: 1, bedrooms: 1, built_area_m2: 30,
    created_at: "2026-10-08T09:00:00Z", currency: "COP", floor_plan_url: null, id: "u1",
    media_url: null, name: "Apto 30 m²", price_from_cents: null, price_to_cents: null,
    private_area_m2: 22, project_id: "p1", source_key: "arrayan-30m", source_kind: "developer",
    source_url: null, updated_at: "2026-10-08T09:00:00Z", verified_at: "2026-10-06T09:21:53Z",
    ...overrides,
  };
}
function source(overrides: Partial<DevelopmentProjectSourceRow> = {}): DevelopmentProjectSourceRow {
  return {
    checked_at: "2026-10-06T09:21:53Z", confidence: "A", created_at: "2026-10-08T09:00:00Z",
    fact_status: "confirmed", http_status: 200, id: "s1", notes: null, observed_facts: {},
    project_id: "p1", scope: "project", source_type: "developer", source_updated_at: null,
    source_url: "https://amarilo.com.co/proyecto/arrayan", updated_at: "2026-10-08T09:00:00Z",
    ...overrides,
  };
}

describe("buildProjectComparison", () => {
  it("keeps the requested order and returns typologies and provenance", () => {
    const a = project({ id: "p1", slug: "arrayan", name: "Arrayán" });
    const b = project({ id: "p2", slug: "vigo", name: "Vigo", neighborhood: "Laureles", primary_source_id: "s2" });
    const { projects, missing } = buildProjectComparison(
      [a, b],
      [unit(), unit({ id: "u2", project_id: "p2", name: "Apto 31 m²", built_area_m2: 31, private_area_m2: null })],
      [source(), source({ id: "s2", project_id: "p2", source_url: "https://tulugar.com/en/projects/colombia/vigo" })],
      ["vigo", "arrayan"],
    );
    expect(missing).toEqual([]);
    expect(projects.map((p) => p.slug)).toEqual(["vigo", "arrayan"]);
    expect(projects[0].unitTypes[0].areasLabel).toBe("31 m² built");
    expect(projects[1].unitTypes[0].areasLabel).toBe("30 m² built · 22 m² private");
    expect(projects[0].primarySourceUrl).toBe("https://tulugar.com/en/projects/colombia/vigo");
    expect(projects[0].primarySourceCheckedLabel).toBe("6 Oct 2026");
  });

  it("names missing/unpublished slugs instead of inventing a project", () => {
    const { projects, missing } = buildProjectComparison([project()], [], [], ["arrayan", "ghost"]);
    expect(projects.map((p) => p.slug)).toEqual(["arrayan"]);
    expect(missing).toEqual(["ghost"]);
  });

  it("lists explicit unknowns per project", () => {
    const bare = project({ price_from_cents: null, expected_delivery_year: null, delivery_note: null });
    const { projects } = buildProjectComparison([bare], [], [], ["arrayan"]);
    expect(projects[0].priceLabel).toBe("Not published");
    expect(projects[0].unknownFields).toEqual(expect.arrayContaining(["price", "delivery date", "unit types"]));
  });
});
