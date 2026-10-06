import { describe, expect, it } from "vitest";
import { buildNewProjectCards } from "@/mastra/tools/search-new-projects";
import type { NewProjectFilters } from "@/lib/new-projects/types";
import type {
  DevelopmentProjectRow,
  DevelopmentProjectSourceRow,
  DevelopmentUnitTypeRow,
} from "@/lib/new-projects/types";

function project(overrides: Partial<DevelopmentProjectRow> = {}): DevelopmentProjectRow {
  return {
    address: null,
    amenities: null,
    city: "Medellín",
    construction_progress: null,
    created_at: "2026-10-08T09:00:00Z",
    currency: "COP",
    delivery_note: null,
    expected_delivery_quarter: null,
    expected_delivery_year: null,
    id: "p1",
    latitude: null,
    longitude: null,
    name: "Arrayán",
    neighborhood: "Ciudad del Río",
    notes: null,
    ownership_status: "unclaimed",
    partner_id: null,
    payment_plan: null,
    price_from_cents: 57500000000,
    price_to_cents: null,
    primary_source_id: "s1",
    project_status: "pre_sale",
    publish_state: "published",
    slug: "arrayan",
    source_key: "medellin:new-project:arrayan",
    source_kind: "developer",
    source_owner: "Amarilo",
    source_url: "https://amarilo.com.co/proyecto/arrayan",
    updated_at: "2026-10-08T09:00:00Z",
    verified_at: "2026-10-06T09:21:53Z",
    vis_flag: false,
    ...overrides,
  };
}

function unit(overrides: Partial<DevelopmentUnitTypeRow> = {}): DevelopmentUnitTypeRow {
  return {
    availability: null,
    bathrooms: 1,
    bedrooms: 1,
    built_area_m2: 30,
    created_at: "2026-10-08T09:00:00Z",
    currency: "COP",
    floor_plan_url: null,
    id: "u1",
    media_url: null,
    name: "Apto 30 m²",
    price_from_cents: null,
    price_to_cents: null,
    private_area_m2: 22,
    project_id: "p1",
    source_key: "arrayan-30m",
    source_kind: "developer",
    source_url: "https://amarilo.com.co/proyecto/arrayan",
    updated_at: "2026-10-08T09:00:00Z",
    verified_at: "2026-10-06T09:21:53Z",
    ...overrides,
  };
}

function source(overrides: Partial<DevelopmentProjectSourceRow> = {}): DevelopmentProjectSourceRow {
  return {
    checked_at: "2026-10-06T09:21:53Z",
    confidence: "A",
    created_at: "2026-10-08T09:00:00Z",
    fact_status: "confirmed",
    http_status: 200,
    id: "s1",
    notes: null,
    observed_facts: {},
    project_id: "p1",
    scope: "project",
    source_type: "developer",
    source_updated_at: null,
    source_url: "https://amarilo.com.co/proyecto/arrayan",
    updated_at: "2026-10-08T09:00:00Z",
    ...overrides,
  };
}

function filters(overrides: Partial<NewProjectFilters> = {}): NewProjectFilters {
  return {
    neighborhood: null,
    maxPriceCop: null,
    minBedrooms: null,
    deliveryYear: null,
    deliveryUnknown: false,
    ...overrides,
  };
}

describe("buildNewProjectCards — grounded, honest cards", () => {
  it("labels a single price as From and keeps provenance", () => {
    const cards = buildNewProjectCards([project()], [unit()], [source()], filters(), 8);
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.priceLabel).toBe("From COP 575,000,000");
    expect(card.priceKnown).toBe(true);
    expect(card.bedroomsLabel).toBe("1 bedroom");
    expect(card.primarySourceUrl).toBe("https://amarilo.com.co/proyecto/arrayan");
    expect(card.primarySourceCheckedLabel).toBe("6 Oct 2026");
    expect(card.detailUrl).toBe("/new-projects/arrayan");
    expect(card.unknownFields).toContain("delivery date");
  });

  it("names every unpublished fact instead of inventing a value", () => {
    const bare = project({
      price_from_cents: null,
      price_to_cents: null,
      expected_delivery_year: null,
      delivery_note: null,
    });
    const cards = buildNewProjectCards([bare], [], [], filters(), 8);
    expect(cards[0].priceLabel).toBe("Not published");
    expect(cards[0].priceKnown).toBe(false);
    expect(cards[0].deliveryLabel).toBe("Delivery date not published");
    expect(cards[0].bedroomsLabel).toBeNull();
    expect(cards[0].unknownFields).toEqual(
      expect.arrayContaining(["price", "delivery date", "bedroom count", "unit types"]),
    );
  });

  it("excludes an unknown price when a max price filter is applied", () => {
    const known = project({ id: "p1", slug: "arrayan", name: "Arrayán", price_from_cents: 57500000000 });
    const unknown = project({
      id: "p2",
      slug: "grand-coral",
      name: "Grand Coral",
      price_from_cents: null,
      price_to_cents: null,
    });
    const cards = buildNewProjectCards(
      [known, unknown],
      [],
      [],
      filters({ maxPriceCop: 600000000 }),
      8,
    );
    expect(cards.map((card) => card.slug)).toEqual(["arrayan"]);
  });

  it("applies a delivery-year filter and never matches an unknown delivery", () => {
    const dated = project({ id: "p1", slug: "dated", name: "Dated", expected_delivery_year: 2027 });
    const undated = project({ id: "p2", slug: "undated", name: "Undated", expected_delivery_year: null });
    const cards = buildNewProjectCards([dated, undated], [], [], filters({ deliveryYear: 2027 }), 8);
    expect(cards.map((card) => card.slug)).toEqual(["dated"]);
  });

  it("sorts deterministically by name and respects the limit", () => {
    const a = project({ id: "p1", slug: "zeta", name: "Zeta" });
    const b = project({ id: "p2", slug: "alpha", name: "Alpha" });
    const cards = buildNewProjectCards([a, b], [], [], filters(), 1);
    expect(cards.map((card) => card.name)).toEqual(["Alpha"]);
  });
});
