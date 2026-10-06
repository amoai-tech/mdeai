import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CafeResultCard } from "../cafe-result-card";

describe("CafeResultCard", () => {
  it("renders ranked grounded café facts without semantic claims", () => {
    const html = renderToStaticMarkup(
      <CafeResultCard
        testId="grounded-card"
        pinId="grounded-rituales"
        rank={1}
        title="Rituales Compañía de Café"
        rating={4.7}
        userRatingCount={1600}
        priceLevel="PRICE_LEVEL_INEXPENSIVE"
        openNow={true}
        primaryType="cafe"
        summary="Specialty coffee stop in Laureles with a calm weekday feel."
        formattedAddress="Laureles, Medellín"
        placeId="places/abc"
        fieldMaskVersion="places-new-v1"
      />,
    );

    expect(html).toContain('data-testid="grounded-card"');
    expect(html).toContain('data-result-kind="cafe"');
    expect(html).toContain('data-pin-id="grounded-rituales"');
    expect(html).toContain("Match #1");
    expect(html).toContain("Google-verified candidate");
    expect(html).toContain("Place ID");
    expect(html).toContain("★ 4.7");
  });

  it("renders details and booking stub actions", () => {
    const html = renderToStaticMarkup(
      <CafeResultCard
        pinId="grounded-pergamino"
        rank={2}
        title="Pergamino"
        mapsUrl="https://maps.google.com/?cid=1"
        directionsUrl="https://maps.google.com/maps/dir//x"
        reviewsUrl="https://maps.google.com/maps/reviews/x"
      />,
    );

    expect(html).toContain('data-testid="cafe-details-cta"');
    expect(html).toContain('data-testid="cafe-booking-cta"');
    expect(html).toContain('data-testid="cafe-card-directions-link"');
    expect(html).toContain('data-testid="cafe-card-reviews-link"');
  });

  describe("SAN-878 · Google Maps source attribution", () => {
    afterEach(() => vi.unstubAllEnvs());

    const render = (props: Partial<React.ComponentProps<typeof CafeResultCard>> = {}) =>
      renderToStaticMarkup(
        <CafeResultCard
          testId="grounded-card"
          pinId="grounded-pausa"
          rank={1}
          title="Pausa Coffee & Brunch"
          summary="Quiet specialty coffee with workspace seating."
          mapsUrl="https://maps.google.com/?cid=1"
          directionsUrl="https://www.google.com/maps/dir/?api=1&destination_place_id=x"
          reviewsUrl="https://search.google.com/local/reviews?placeid=x"
          {...props}
        />,
      );

    it("shows the Google Maps source with the place name and its URL, right after the generated summary", () => {
      const html = render();
      const source = html.indexOf('data-testid="grounding-attribution"');
      expect(source).toBeGreaterThan(-1);
      expect(html.indexOf("Quiet specialty coffee")).toBeLessThan(source);
      expect(html.indexOf("Google-verified candidate")).toBeGreaterThan(source);
      const block = html.slice(source, html.indexOf("</p>", source));
      expect(block).toContain('href="https://maps.google.com/?cid=1"');
      expect(block).toContain("Google Maps");
      expect(block).toContain("Pausa Coffee &amp; Brunch");
      expect(block).toContain('translate="no"');
    });

    it("keeps the Directions and Reviews links as they were", () => {
      const html = render();
      expect(html).toContain('data-testid="cafe-card-directions-link"');
      expect(html).toContain('data-testid="cafe-card-reviews-link"');
    });

    it("shows the same single attribution on nightlife cards", () => {
      const html = render({ resultKind: "nightlife" });
      expect(html.match(/data-testid="grounding-attribution"/g)).toHaveLength(1);
    });

    it("with deep links off there is still exactly one Google Maps link", () => {
      vi.stubEnv("NEXT_PUBLIC_MAPS_DEEP_LINKS", "false");
      const html = render();
      expect(html.match(/>Google Maps/g)).toHaveLength(1);
      expect(html).toContain('data-testid="grounding-attribution"');
    });

    it("without a Maps URL it still attributes to Google Maps and does not invent a link", () => {
      const html = render({ mapsUrl: undefined, directionsUrl: undefined, reviewsUrl: undefined });
      const source = html.indexOf('data-testid="grounding-attribution"');
      expect(source).toBeGreaterThan(-1);
      const block = html.slice(source, html.indexOf("</p>", source));
      expect(block).toContain("Google Maps");
      expect(block).not.toContain("<a ");
    });
  });
});
