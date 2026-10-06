import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectCard } from "@/components/new-projects/project-card";
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
    expectedDeliveryYear: 2027,
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

function render(overrides: Partial<NewProjectSummary> = {}): string {
  return renderToStaticMarkup(<ProjectCard project={project(overrides)} />);
}

describe("ProjectCard — partial and unknown data", () => {
  it("renders the identity, price-from and verification date", () => {
    const html = render();
    expect(html).toContain('data-testid="new-project-card-arrayan"');
    expect(html).toContain('data-testid="new-project-card-link-arrayan"');
    expect(html).toContain("Ciudad del Río");
    expect(html).toContain("From COP 575,000,000");
    expect(html).toContain("Price-from, not an exact unit price.");
    expect(html).toContain("Verified 6 Oct 2026");
    expect(html).toContain("1–3 bedrooms");
  });

  it("says the price is not published instead of showing zero", () => {
    const html = render({ priceFromCents: null, priceToCents: null });
    expect(html).toContain("Not published");
    expect(html).toContain("Price not published; ask us.");
    expect(html).not.toContain("COP 0");
  });

  it("states that the delivery date is not published when no source gave one", () => {
    const html = render({
      expectedDeliveryYear: null,
      expectedDeliveryQuarter: null,
      deliveryNote: null,
    });
    expect(html).toContain("Delivery date not published");
  });

  it("shows an estimated delivery note honestly", () => {
    const html = render({ expectedDeliveryYear: null, deliveryNote: "Estimada" });
    expect(html).toContain("Delivery: Estimada");
    expect(html).not.toContain("Delivery 2027");
  });

  it("omits the bedroom badge when no unit type established a range", () => {
    const html = render({ minBedrooms: null, maxBedrooms: null });
    expect(html).not.toContain("bedrooms");
  });
});
