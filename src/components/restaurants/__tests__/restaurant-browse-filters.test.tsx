// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RestaurantBrowseFilters } from "../restaurant-browse-filters";

afterEach(cleanup);

describe("RestaurantBrowseFilters accessibility", () => {
  it("uses aria-current only on selected navigation links, never aria-pressed", () => {
    const { container } = render(
      <RestaurantBrowseFilters neighborhood="Laureles" cuisine="colombian" />,
    );

    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(
      screen.getByTestId("restaurants-filter-neighborhood-laureles").getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByTestId("restaurants-filter-cuisine-colombian").getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByTestId("restaurants-filter-neighborhood-envigado").hasAttribute("aria-current"),
    ).toBe(false);
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(2);
  });
});
