// @vitest-environment jsdom
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

  it("keeps the chosen chip and the Apply dates button readable: tint under 10% (text-primary on bg-primary/10 measured 4.4:1, needs 4.5:1)", () => {
    const chosen = renderToStaticMarkup(<RentalBrowseFilters neighborhood="Laureles" beds="2" />);
    expect(chosen).not.toContain("bg-primary/10");
    expect(chosen.match(/bg-primary\/5/g)?.length).toBe(3); // chosen neighborhood, chosen bedrooms, Apply dates
  });

  it("never writes maxPrice into a filter link", () => {
    expect(html).not.toContain("maxPrice");
  });
});

describe("RentalBrowseFilters — stay dates (SAN-486)", () => {
  const withDates = renderToStaticMarkup(
    <RentalBrowseFilters neighborhood="Laureles" beds="2" from="2026-11-01" through="2026-11-30" />,
  );

  it("renders labelled From and Through date inputs holding the URL values", () => {
    expect(withDates).toMatch(/From\s*<input[^>]*type="date"[^>]*name="from"[^>]*value="2026-11-01"/);
    expect(withDates).toMatch(/Through\s*<input[^>]*type="date"[^>]*name="through"[^>]*value="2026-11-30"/);
  });

  it("is a plain GET form that keeps the other filters in hidden fields", () => {
    expect(withDates).toContain('method="get"');
    expect(withDates).toContain('action="/rentals"');
    expect(withDates).toMatch(/<input type="hidden" name="neighborhood" value="Laureles"/);
    expect(withDates).toMatch(/<input type="hidden" name="beds" value="2"/);
  });

  it("neighborhood and bedroom chips keep the chosen dates", () => {
    // Read the actual link from the rendered markup rather than slicing the HTML string,
    // so the assertion does not depend on attribute order and parses real DOM.
    const parsed = new DOMParser().parseFromString(withDates, "text/html");
    const href = (testId: string) =>
      parsed.querySelector(`[data-testid="${testId}"]`)?.getAttribute("href") ?? "";
    expect(href("rentals-filter-neighborhood-envigado")).toContain("from=2026-11-01");
    expect(href("rentals-filter-neighborhood-envigado")).toContain("through=2026-11-30");
    expect(href("rentals-filter-beds-1")).toContain("from=2026-11-01");
  });

  it("offers Clear dates only when dates or an error are present, and the link drops them", () => {
    expect(withDates).toContain("rentals-dates-clear");
    expect(renderToStaticMarkup(<RentalBrowseFilters neighborhood={null} beds={null} />)).not.toContain("rentals-dates-clear");
    expect(withDates).toMatch(/<a [^>]*data-testid="rentals-dates-clear"[^>]*href="\/rentals\?neighborhood=Laureles&amp;beds=2"/);
  });

  it("announces a date problem to assistive technology and marks the inputs invalid", () => {
    const bad = renderToStaticMarkup(
      <RentalBrowseFilters neighborhood={null} beds={null} dateError="Dates must be real calendar dates." />,
    );
    expect(bad).toMatch(/role="alert"[^>]*>Dates must be real calendar dates\./);
    expect(bad).toContain('aria-invalid="true"');
    // The error element's id is generated (the bar renders twice, so a fixed id would be duplicated).
    const id = bad.match(/<p id="([^"]+)" role="alert"/)?.[1];
    expect(id).toBeTruthy();
    expect(bad).toContain(`aria-describedby="${id}"`);
    const twice = renderToStaticMarkup(
      <>
        <RentalBrowseFilters neighborhood={null} beds={null} dateError="x" />
        <RentalBrowseFilters neighborhood={null} beds={null} dateError="x" />
      </>,
    );
    const ids = [...twice.matchAll(/<p id="([^"]+)" role="alert"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2); // two copies on one page never share an id
  });
});
