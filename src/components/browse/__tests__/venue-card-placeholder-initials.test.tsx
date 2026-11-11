import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Coffee } from "lucide-react";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";

/**
 * Photo-less venues must not all look identical, and the placeholder contract forbids conveying
 * category by colour — so differentiation is the venue's own initials plus the existing label.
 */
describe("VenueCardPlaceholder initials", () => {
  it("shows the venue's initials when it has them", () => {
    const html = renderToStaticMarkup(
      <VenueCardPlaceholder label="Café" icon={<Coffee />} initials="RC" testId="ph" />,
    );
    expect(html).toContain('data-testid="venue-placeholder-initials"');
    expect(html).toContain("RC");
    expect(html).toContain("Café");
  });

  it("falls back to the category glyph when it does not", () => {
    const html = renderToStaticMarkup(<VenueCardPlaceholder label="Event" icon={<Coffee />} testId="ph" />);
    expect(html).not.toContain('data-testid="venue-placeholder-initials"');
    expect(html).toContain("<svg");
  });
});
