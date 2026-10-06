// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectCard } from "@/components/new-projects/project-card";
import type { NewProjectSummary } from "@/lib/new-projects/types";

/**
 * Assertions query the rendered DOM instead of substring-matching an HTML string. That is both
 * a stronger test (element + attribute) and avoids feeding markup to `expect`, which static
 * analysis (rightly) treats as a mixed-HTML sink.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    bedroomOptions: [
      { bedrooms: 1, priceFromCents: null },
      { bedrooms: 2, priceFromCents: null },
      { bedrooms: 3, priceFromCents: null },
    ],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(overrides: Partial<NewProjectSummary> = {}): HTMLDivElement {
  act(() => {
    root.render(<ProjectCard project={project(overrides)} />);
  });
  return container;
}

describe("ProjectCard — partial and unknown data", () => {
  it("renders the identity, price-from and verification date", () => {
    const el = render();
    expect(el.querySelector('[data-testid="new-project-card-arrayan"]')).not.toBeNull();
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="new-project-card-link-arrayan"]');
    expect(link?.getAttribute("href")).toBe("/new-projects/arrayan");
    expect(el.querySelector('[data-testid="new-project-card-neighborhood"]')?.textContent).toContain(
      "Ciudad del Río",
    );
    expect(el.querySelector('[data-testid="new-project-card-price"]')?.textContent).toContain(
      "From COP 575,000,000",
    );
    expect(container.textContent).toContain("Price-from, not an exact unit price.");
    expect(container.textContent).toContain("Verified 6 Oct 2026");
    expect(container.textContent).toContain("1–3 bedrooms");
  });

  it("says the price is not published instead of showing zero", () => {
    const el = render({ priceFromCents: null, priceToCents: null });
    expect(el.textContent).toContain("Not published");
    expect(el.textContent).toContain("Price not published; ask us.");
    expect(el.textContent).not.toContain("COP 0");
  });

  it("states that the delivery date is not published when no source gave one", () => {
    const el = render({ expectedDeliveryYear: null, expectedDeliveryQuarter: null, deliveryNote: null });
    expect(el.textContent).toContain("Delivery date not published");
  });

  it("shows an estimated delivery note honestly", () => {
    const el = render({ expectedDeliveryYear: null, deliveryNote: "Estimada" });
    expect(el.textContent).toContain("Delivery: Estimada");
    expect(el.textContent).not.toContain("Delivery 2027");
  });

  it("omits the bedroom badge when no unit type established a range", () => {
    const el = render({ minBedrooms: null, maxBedrooms: null });
    expect(el.textContent).not.toContain("bedrooms");
  });
});
