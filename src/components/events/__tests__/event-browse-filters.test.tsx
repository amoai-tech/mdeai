import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventBrowseFilters } from "@/components/events/event-browse-filters";

const none = { category: null, neighborhood: null, dateWindow: null, price: null } as const;

describe("EventBrowseFilters", () => {
  it("marks active links with aria-current, never aria-pressed", () => {
    const html = renderToStaticMarkup(<EventBrowseFilters {...none} category="music" />);
    expect(html).not.toContain("aria-pressed=");
    expect(html.match(/aria-current="true"/g)).toHaveLength(2); // "Any date" + Music
    expect(html).toContain('data-testid="events-filter-clear"');
  });

  it("collapses secondary filters on phones and offers an accessible toggle", () => {
    const html = renderToStaticMarkup(<EventBrowseFilters {...none} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain("sm:contents");
    expect(html).not.toContain('data-testid="events-filter-clear"');
  });

  it("keeps an applied secondary filter visible instead of hiding it behind the toggle", () => {
    const html = renderToStaticMarkup(<EventBrowseFilters {...none} price="paid" />);
    expect(html).not.toContain('data-testid="events-filter-more"');
    expect(html).not.toContain('class="hidden');
    expect(html).toContain('data-testid="events-filter-price-paid"');
  });
});
