/**
 * SAN-1089 — USD/night caps are not a valid budget for COP/month stock. Until SAN-386 ships a
 * validated amount + currency + period contract there must be no price chip at all.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RentalBrowseFilters } from "@/components/rentals/rental-browse-filters";

describe("RentalBrowseFilters", () => {
  const html = renderToStaticMarkup(
    <RentalBrowseFilters neighborhood={null} beds={null} />,
  );

  it("renders no nightly price chips or heading", () => {
    expect(html).not.toContain("rentals-filter-price");
    expect(html).not.toMatch(/\/\s*night/i);
    expect(html).not.toMatch(/\$\s?\d+/);
  });

  it("keeps the neighborhood and bedroom filters", () => {
    expect(html).toContain("rentals-filter-neighborhood-laureles");
    expect(html).toContain("rentals-filter-beds-2");
  });

  it("never writes maxPrice into a filter link", () => {
    expect(html).not.toContain("maxPrice");
  });
});
