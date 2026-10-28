import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MapPin } from "@/platform/contracts";
import { SelectedPlaceOverlayCard } from "../SelectedPlaceOverlayCard";

const groundedPin: MapPin = {
  id: "grounded-test-1",
  category: "grounded",
  lat: 6.25,
  lng: -75.59,
  title: "Café Noir",
  subtitle: "Medellín, Antioquia",
  placeUri: "https://maps.google.com/?cid=1",
  source: "grounding",
  meta: {
    rating: 4.8,
    userRatingCount: 1800,
    openNow: false,
    photoName: "places/ChIJx/photos/abc",
    summary: "Specialty coffee in Laureles with a calm vibe.",
    priceLevel: "PRICE_LEVEL_EXPENSIVE",
    primaryType: "cafe",
  },
};

describe("SelectedPlaceOverlayCard", () => {
  it("renders rich overlay with photo, editorial, and trip actions placeholder", () => {
    const html = renderToStaticMarkup(
      <SelectedPlaceOverlayCard pin={groundedPin} />,
    );
    expect(html).toContain('data-testid="selected-place-overlay-photo"');
    expect(html).toContain("/api/places/photo?");
    expect(html).toContain('data-testid="selected-place-overlay-rating"');
    expect(html).toContain('data-testid="selected-place-overlay-editorial"');
    expect(html).toContain("Specialty coffee");
    expect(html).toContain('data-testid="selected-place-overlay-save"');
    expect(html).toContain('data-testid="selected-place-overlay-add-trip"');
    expect(html).not.toContain('data-testid="map-pin-preview"');
  });

  it("uses glyph placeholder when no photo (never on map marker)", () => {
    const pin: MapPin = { ...groundedPin, meta: { rating: 4.5 } };
    const html = renderToStaticMarkup(
      <SelectedPlaceOverlayCard pin={pin} />,
    );
    expect(html).toContain('data-testid="selected-place-overlay-photo-placeholder"');
    expect(html).toContain("☕");
  });

  it("links an event pin to its own Details page, and ignores external or protocol-relative paths", () => {
    const eventPin: MapPin = { ...groundedPin, id: "event-1", category: "event", meta: { detailsPath: "/events/salsa-night" } };
    expect(renderToStaticMarkup(<SelectedPlaceOverlayCard pin={eventPin} />)).toContain('href="/events/salsa-night"');
    for (const detailsPath of ["//evil.example/x", "https://evil.example/x", "/events/x?next=https://evil.example", "/events/x#frag", "/events/../admin", "/events\\x"]) {
      const html = renderToStaticMarkup(<SelectedPlaceOverlayCard pin={{ ...eventPin, meta: { detailsPath } }} />);
      expect(html).not.toContain("selected-place-overlay-details");
    }
  });

  it("hides the unsupported Save and Add to trip buttons for events only", () => {
    const eventHtml = renderToStaticMarkup(<SelectedPlaceOverlayCard pin={{ ...groundedPin, id: "event-2", category: "event", meta: {} }} />);
    expect(eventHtml).not.toContain("selected-place-overlay-save");
    expect(eventHtml).not.toContain("selected-place-overlay-add-trip");
    const groundedHtml = renderToStaticMarkup(<SelectedPlaceOverlayCard pin={groundedPin} />);
    expect(groundedHtml).toContain("selected-place-overlay-save");
    expect(groundedHtml).toContain("selected-place-overlay-add-trip");
  });
});
