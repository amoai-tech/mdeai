import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrowseLayout } from "../BrowseLayout";

describe("BrowseLayout", () => {
  it("renders header, filters, and children", () => {
    const html = renderToStaticMarkup(
      <BrowseLayout
        testId="restaurants-browse"
        title="Restaurants"
        subtitle="Food in Medellín"
        filterBar={<div data-testid="filters">filters</div>}
      >
        <section data-testid="results">grid</section>
      </BrowseLayout>,
    );

    expect(html).toContain('data-testid="restaurants-browse"');
    expect(html).toContain('data-testid="filters"');
    expect(html).toContain('data-testid="results"');
    expect(html).toContain("Restaurants");
  });

  it("returns to the actual /chat workspace from every browse page (SAN-1088)", () => {
    const html = renderToStaticMarkup(
      <BrowseLayout testId="events-browse" title="Events" subtitle="In Medellín" filterBar={<div />}>
        <section />
      </BrowseLayout>,
    );
    expect(html).toMatch(/<a(?=[^>]*aria-label="Back to chat")(?=[^>]*href="\/chat")[^>]*>/);
    expect(html).toMatch(/<a[^>]*href="\/chat"[^>]*>Ask concierge<\/a>/);
    expect(html).not.toContain('href="/"');
  });

  it("stretches the map column's wrapper to the list height so the sticky map can actually stick (SAN-1416)", () => {
    const html = renderToStaticMarkup(
      <BrowseLayout
        testId="rentals-browse"
        title="Rentals"
        subtitle="x"
        filterBar={<div />}
        mapSlot={<div data-testid="map-slot" />}
      >
        <section />
      </BrowseLayout>,
    );
    expect(html).toMatch(/<aside[^>]*class="[^"]*lg:self-stretch[^"]*"[^>]*><div data-testid="map-slot"/);
  });
});
