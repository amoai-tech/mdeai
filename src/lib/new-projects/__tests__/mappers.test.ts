import { describe, expect, it } from "vitest";
import { bedroomRange, buildDetail, rowToSource, rowToSummary, rowToUnitType } from "@/lib/new-projects/mappers";
import type {
  DevelopmentProjectRow,
  DevelopmentProjectSourceRow,
  DevelopmentUnitTypeRow,
} from "@/lib/new-projects/types";

function projectRow(overrides: Partial<DevelopmentProjectRow> = {}): DevelopmentProjectRow {
  return {
    address: "Calle 17 #43F-122",
    amenities: null,
    city: "Medellín",
    construction_progress: null,
    created_at: "2026-10-08T09:00:00Z",
    currency: "COP",
    delivery_note: "Segundo Semestre 2029 Etapa 1",
    expected_delivery_quarter: null,
    expected_delivery_year: 2029,
    id: "p1",
    latitude: null,
    longitude: null,
    name: "Palma",
    neighborhood: "Ciudad del Río",
    notes: null,
    ownership_status: "unclaimed",
    partner_id: null,
    payment_plan: null,
    price_from_cents: null,
    price_to_cents: null,
    primary_source_id: "s1",
    project_status: "pre_sale",
    publish_state: "published",
    slug: "palma",
    source_key: "medellin:new-project:palma",
    source_kind: "developer",
    source_owner: "Amarilo / C.A.S.A.",
    source_url: "https://amarilo.com.co/proyecto/palma",
    updated_at: "2026-10-08T09:00:00Z",
    verified_at: "2026-10-06T09:21:53Z",
    vis_flag: false,
    ...overrides,
  };
}

function unitRow(overrides: Partial<DevelopmentUnitTypeRow> = {}): DevelopmentUnitTypeRow {
  return {
    availability: null,
    bathrooms: 3,
    bedrooms: 3,
    built_area_m2: 129,
    created_at: "2026-10-08T09:00:00Z",
    currency: "COP",
    floor_plan_url: null,
    id: "u1",
    media_url: null,
    name: "Apto 129 m²",
    price_from_cents: null,
    price_to_cents: null,
    private_area_m2: 101,
    project_id: "p1",
    source_key: "unit-fixture-a",
    source_kind: "developer",
    source_url: "https://amarilo.com.co/proyecto/palma",
    updated_at: "2026-10-08T09:00:00Z",
    verified_at: "2026-10-06T09:21:53Z",
    ...overrides,
  };
}

function sourceRow(overrides: Partial<DevelopmentProjectSourceRow> = {}): DevelopmentProjectSourceRow {
  return {
    checked_at: "2026-10-06T09:21:53Z",
    confidence: "A",
    created_at: "2026-10-08T09:00:00Z",
    fact_status: "confirmed",
    http_status: 200,
    id: "s1",
    notes: null,
    observed_facts: { project_name: "Palma" },
    project_id: "p1",
    scope: "project",
    source_type: "developer",
    source_updated_at: null,
    source_url: "https://amarilo.com.co/proyecto/palma",
    updated_at: "2026-10-08T09:00:00Z",
    ...overrides,
  };
}

describe("mappers", () => {
  it("computes the bedroom range from known units only", () => {
    expect(bedroomRange([])).toEqual({ min: null, max: null });
    expect(bedroomRange([unitRow({ bedrooms: 3 }), unitRow({ id: "u2", bedrooms: 1 })])).toEqual({
      min: 1,
      max: 3,
    });
    expect(bedroomRange([unitRow({ bedrooms: null })])).toEqual({ min: null, max: null });
  });

  it("maps a row to a summary without inventing facts", () => {
    const summary = rowToSummary(projectRow(), [unitRow()]);
    expect(summary.slug).toBe("palma");
    expect(summary.sourceOwner).toBe("Amarilo / C.A.S.A.");
    expect(summary.priceFromCents).toBeNull();
    expect(summary.expectedDeliveryYear).toBe(2029);
    expect(summary.minBedrooms).toBe(3);
    expect(summary.maxBedrooms).toBe(3);
    expect(summary.unitTypeCount).toBe(1);
    expect(summary.bedroomOptions).toEqual([{ bedrooms: 3, priceFromCents: null }]);
  });

  it("maps unit types and sources", () => {
    expect(rowToUnitType(unitRow()).privateAreaM2).toBe(101);
    expect(rowToSource(sourceRow()).httpStatus).toBe(200);
    expect(rowToSource(sourceRow()).observedFacts).toEqual({ project_name: "Palma" });
  });

  it("builds a detail that preserves evidence and unknowns", () => {
    const detail = buildDetail(projectRow(), [unitRow()], [sourceRow()]);
    expect(detail.address).toBe("Calle 17 #43F-122");
    expect(detail.unitTypes).toHaveLength(1);
    expect(detail.sources.map((s) => s.id)).toEqual(["s1"]);
    expect(detail.latitude).toBeNull();
    expect(detail.paymentPlan).toBeNull();
  });
});
