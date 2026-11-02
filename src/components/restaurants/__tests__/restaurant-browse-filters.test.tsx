import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RestaurantBrowseFilters } from "../restaurant-browse-filters";

describe("RestaurantBrowseFilters accessibility", () => {
  it("uses aria-current only on selected navigation links, never aria-pressed", () => {
    const html = renderToStaticMarkup(<RestaurantBrowseFilters neighborhood="Laureles" cuisine="colombian" />);
    expect(html).not.toMatch(/\saria-pressed=/);
    expect(html).toContain('data-testid="restaurants-filter-neighborhood-laureles"');
    expect(html).toContain('aria-current="true"');
    expect((html.match(/aria-current="true"/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
