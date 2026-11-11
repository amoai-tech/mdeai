import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { RestaurantCard } from "../restaurant-card";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("RestaurantCard", () => {
  it("renders photo, rating, and price badges for full payload", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="Mal De Ojo"
        neighborhood="El Poblado"
        cuisine="paisa"
        priceTier="$$"
        avgPricePerPerson={22}
        rating={4.5}
        imageUrl="https://example.com/photo.jpg"
        mapsUrl="https://maps.google.com/?cid=1"
        aiSummary="Classic paisa plates in a lively dining room."
        pinId="restaurant-r1"
        testId="restaurant-card"
        onSelect={() => undefined}
        onOpenDetails={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="restaurant-card-photo"');
    expect(html).toContain("absolute inset-0");
    expect(html).toContain("aspect-[16/10]");
    expect(html).toContain('data-testid="restaurant-card-rating"');
    expect(html).toContain("★ 4.5");
    expect(html).toContain("$22/person");
    expect(html).toContain("Paisa");
    expect(html).toContain('data-result-kind="restaurant"');
  });

  it("sets body aria-label when details CTA is interactive", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="Mal De Ojo"
        pinId="restaurant-r1"
        testId="restaurant-card"
        onOpenDetails={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Open details for Mal De Ojo"');
  });

  it("renders glyph placeholder when image missing", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="Sparse Spot"
        pinId="restaurant-x"
        testId="restaurant-card"
      />,
    );
    expect(html).toContain('data-testid="restaurant-card-photo-placeholder"');
    expect(html).not.toContain('data-testid="restaurant-card-photo"');
    expect(html).toContain("aspect-[16/10]");
  });

  it("renders full-width cover media for browse layout", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="Browse Spot"
        imageUrl="https://example.com/photo.jpg"
        mediaLayout="cover"
        composition="nova"
        pinId="restaurant-cover-test"
        testId="restaurant-card"
      />,
    );
    expect(html).toContain("aspect-[16/10]");
    expect(html).toContain("w-full");
    expect(html).toContain("object-cover");
  });

  it("hides event venue CTA when no offerings handler is provided", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="No Events Here"
        pinId="restaurant-plain"
        testId="restaurant-card"
      />,
    );
    expect(html).not.toContain('data-testid="event-venue-cta"');
    expect(html).not.toContain('data-testid="restaurant-hosts-events-badge"');
  });

  it("renders Request booking CTA when onBookRequest is provided", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="Rocoto"
        pinId="restaurant-rocoto"
        testId="restaurant-card"
        onBookRequest={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="restaurant-booking-cta"');
    expect(html).toContain("Request");
  });

  it("shows event venue CTA with 44px touch target when offerings exist", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="Mamacita"
        pinId="restaurant-mamacita"
        testId="restaurant-card"
        hostsEvents
        onOpenEventVenue={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="event-venue-cta"');
    // Shared discovery action height token (see --spacing-card-action).
    expect(html).toContain("h-card-action");
    expect(html).toContain("min-w-card-action");
    expect(html).toContain('data-testid="restaurant-hosts-events-badge"');
    expect(html).toContain("Hosts Events");
  });

  it("renders the browse footer contract: Directions, View on map, Ask, Details", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard
        title="Moshi"
        neighborhood="Medellín"
        cuisine="seafood"
        priceTier="$$$$"
        rating={4.6}
        mapsUrl="https://maps.google.com/?cid=moshi"
        pinId="restaurant-moshi"
        testId="restaurant-card-moshi"
        composition="nova"
        onSelect={() => undefined}
        onAskSelect={() => undefined}
        detailsHref="/restaurants/moshi"
        detailsTestId="restaurant-detail-link-moshi"
      />,
    );
    expect(html).toContain('data-testid="restaurant-ask-select"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Ask about this");
    expect(html).toContain('data-testid="restaurant-detail-link-moshi"');
    expect(html).toContain('href="/restaurants/moshi"');
    expect(html).toContain("Details");
    expect(html).toMatch(
      /restaurant-card-directions-link|restaurant-card-maps-link/,
    );
    // One footer, one card: no second Details control in browse mode.
    expect(html).not.toContain('data-testid="restaurant-details-cta"');
    expect(html.match(/data-testid="restaurant-ask-select"/g)).toHaveLength(1);
    expect(
      html.match(/data-testid="restaurant-detail-link-moshi"/g),
    ).toHaveLength(1);
  });

  it("renders no browse actions when browse props are absent", () => {
    const html = renderToStaticMarkup(
      <RestaurantCard title="Chat Only" pinId="restaurant-chat" testId="restaurant-card" />,
    );
    expect(html).not.toContain('data-testid="restaurant-ask-select"');
    expect(html).not.toMatch(/data-testid="restaurant-detail-link-/);
  });
});
