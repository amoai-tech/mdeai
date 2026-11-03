import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RentalsLoading from "../loading";
import { RENTAL_RESULTS_GRID } from "@/lib/rentals/browse-grid";

describe("/rentals loading skeleton (SAN-1421)", () => {
  const html = renderToStaticMarkup(<RentalsLoading />);

  it("uses the same results grid as the loaded page", () => {
    expect(html).toContain(RENTAL_RESULTS_GRID);
  });

  it("fits the narrow results column: no card forces a fixed pixel width", () => {
    // At 1024 px a card gets about 172 px when two sit side by side; a fixed 200 px photo overflowed it.
    expect(html).not.toMatch(/\bw-\[\d+px\]/);
  });

  it("keeps one column between 1024 and 1279 px, two from 1280 px", () => {
    expect(RENTAL_RESULTS_GRID).toContain("lg:grid-cols-1");
    expect(RENTAL_RESULTS_GRID).toContain("xl:grid-cols-2");
  });
});
