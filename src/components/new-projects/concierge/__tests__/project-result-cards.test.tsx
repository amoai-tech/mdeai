// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NewProjectComparisonResults,
  NewProjectResults,
} from "@/components/new-projects/concierge/project-result-cards";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card = {
  slug: "arrayan",
  name: "Arrayán",
  neighborhood: "Ciudad del Río",
  sourceOwner: "Amarilo",
  priceLabel: "From COP 575,000,000",
  priceKnown: true,
  bedroomsLabel: "1–3 bedrooms",
  deliveryLabel: "Delivery date not published",
  statusLabel: "Pre-sale · on plans",
  visLabel: "Not VIS",
  unitTypeCount: 6,
  verifiedLabel: "Verified 6 Oct 2026",
  detailUrl: "/new-projects/arrayan",
  primarySourceUrl: "https://amarilo.com.co/proyecto/arrayan",
  primarySourceCheckedLabel: "6 Oct 2026",
  unknownFields: ["delivery date"],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

function render(node: React.ReactElement) {
  act(() => { root.render(node); });
  return container;
}

describe("new-project chat cards", () => {
  it("renders grounded search cards with links, provenance and explicit unknowns", () => {
    const el = render(<NewProjectResults result={{ results: [card] }} />);
    expect(el.querySelector('[data-testid="new-project-tool-card-arrayan"]')).not.toBeNull();
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="new-project-tool-link-arrayan"]')?.getAttribute("href"),
    ).toBe("/new-projects/arrayan");
    expect(container.textContent).toContain("From COP 575,000,000");
    expect(container.textContent).toContain("Delivery date not published");
    expect(container.textContent).toContain("Not published: delivery date.");
    expect(container.textContent).toContain("Verified 6 Oct 2026");
    const source = el.querySelector<HTMLAnchorElement>('[data-testid="new-project-tool-source"]');
    expect(source?.getAttribute("href")).toBe("https://amarilo.com.co/proyecto/arrayan");
  });

  it("shows a plain empty state rather than inventing results", () => {
    const el = render(<NewProjectResults result={{ results: [] }} />);
    expect(el.querySelector('[data-testid="new-project-tool-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="new-project-tool-results"]')).toBeNull();
  });

  it("renders a side-by-side comparison with typologies", () => {
    const compare = {
      slug: "arrayan", name: "Arrayán", neighborhood: "Ciudad del Río", sourceOwner: "Amarilo",
      priceLabel: "From COP 575,000,000", deliveryLabel: "Delivery date not published",
      statusLabel: "Pre-sale · on plans", verifiedLabel: "Verified 6 Oct 2026",
      primarySourceUrl: "https://amarilo.com.co/proyecto/arrayan",
      unitTypes: [{ name: "Apto 30 m²", areasLabel: "30 m² built · 22 m² private", priceLabel: null }],
      unknownFields: ["delivery date"],
    };
    const el = render(<NewProjectComparisonResults result={{ projects: [compare] }} />);
    expect(el.querySelector('[data-testid="new-project-compare-card-arrayan"]')).not.toBeNull();
    expect(container.textContent).toContain("30 m² built · 22 m² private");
  });
});
