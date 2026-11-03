// @vitest-environment jsdom
/**
 * SAN-1089 — USD/night caps are not a valid budget for COP/month stock. Until SAN-386 ships a
 * validated amount + currency + period contract there must be no price chip at all.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// The date selector navigates with the app router; static rendering has no router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/rentals",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
}));
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

  it("marks the chosen chip with aria-current: filter chips are links, and aria-pressed is not allowed on a link", () => {
    const chosen = renderToStaticMarkup(<RentalBrowseFilters neighborhood="Laureles" beds="2" />);
    expect(chosen).not.toMatch(/\saria-pressed=/);
    expect(chosen).toMatch(/aria-current="true"[^>]*data-testid="rentals-filter-neighborhood-laureles"|data-testid="rentals-filter-neighborhood-laureles"[^>]*aria-current="true"/);
    expect(chosen.match(/aria-current="true"/g)?.length).toBe(2);
  });

  it("never writes maxPrice into a filter link", () => {
    expect(html).not.toContain("maxPrice");
  });
});

describe("RentalBrowseFilters — stay dates (SAN-1611)", () => {
  const withDates = renderToStaticMarkup(
    <RentalBrowseFilters neighborhood="Laureles" beds="2" from="2026-11-01" through="2026-11-30" />,
  );

  it("shows the applied stay on a calendar trigger instead of two raw date inputs", () => {
    expect(withDates).toContain('data-testid="rentals-dates-trigger"');
    expect(withDates).toContain("Nov 1, 2026");
    expect(withDates).toContain("Nov 30, 2026");
    // One date input surface only: no second, competing pair of inputs in the bar.
    expect(withDates).not.toContain('type="date"');
    expect(withDates).not.toContain('name="from"');
  });

  it("neighborhood and bedroom chips keep the chosen dates", () => {
    const parsed = new DOMParser().parseFromString(withDates, "text/html");
    const href = (testId: string) =>
      parsed.querySelector(`[data-testid="${testId}"]`)?.getAttribute("href") ?? "";
    expect(href("rentals-filter-neighborhood-envigado")).toContain("from=2026-11-01");
    expect(href("rentals-filter-neighborhood-envigado")).toContain("through=2026-11-30");
    expect(href("rentals-filter-beds-1")).toContain("from=2026-11-01");
  });

  it("keeps Clear inside the dialog, so a closed calendar offers no destructive control", () => {
    // Apply/Cancel/Clear are asserted end-to-end in e2e/rentals-date-filters.spec.ts.
    expect(withDates).not.toContain("rentals-dates-clear");
  });

  it("announces a date problem to assistive technology and marks the trigger invalid", () => {
    const bad = renderToStaticMarkup(
      <RentalBrowseFilters neighborhood={null} beds={null} dateError="Dates must be real calendar dates." />,
    );
    expect(bad).toMatch(/role="alert"[^>]*>Dates must be real calendar dates\./);
    expect(bad).toContain('aria-invalid="true"');
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

describe("RentalBrowseFilters — contrast (workspace background)", () => {
  it("keeps the chosen chip and the Apply dates button readable: tint under 10% (text-primary on bg-primary/10 measured 4.4:1, needs 4.5:1)", () => {
    const chosen = renderToStaticMarkup(<RentalBrowseFilters neighborhood="Laureles" beds="2" />);
    expect(chosen).not.toContain("bg-primary/10");
    // Apply dates now lives in the dialog, so the tint covers the two chosen chips.
    expect(chosen.match(/bg-primary\/5/g)?.length).toBe(2);
  });
});
