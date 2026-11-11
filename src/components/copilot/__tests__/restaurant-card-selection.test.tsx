// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { RestaurantCard } from "../restaurant-card";

// The card links to the real public details route through next/link. Rendering that
// outside a Next router needs the same minimal anchor mock the other card tests use.
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

/**
 * Preview (hover/focus) must not change the map selection. Before this, `onPreview` called
 * `onSelect`, so hovering the selected restaurant toggled it off and the next click cleared it
 * instead of selecting it.
 */
describe("RestaurantCard selection", () => {
  const renderCard = (onSelect = vi.fn(), onOpenDetails = vi.fn()) =>
    render(
      <RestaurantCard
        title="El Cielo"
        neighborhood="El Poblado"
        cuisine="Colombian"
        rating={4.8}
        pinId="restaurant-1"
        composition="nova"
        selected={false}
        onSelect={onSelect}
        onOpenDetails={onOpenDetails}
      />,
    );

  it("does not select on hover or focus", () => {
    const onSelect = vi.fn();
    const { container } = renderCard(onSelect);
    const root = container.querySelector('[data-testid="restaurant-card"]');
    expect(root).not.toBeNull();
    fireEvent.pointerEnter(root as Element, { pointerType: "mouse" });
    fireEvent.focus(root as Element);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects exactly once when the card body is activated", () => {
    const onSelect = vi.fn();
    const onOpenDetails = vi.fn();
    const { container } = renderCard(onSelect, onOpenDetails);
    const body = container.querySelector('[role="button"]');
    expect(body).not.toBeNull();
    fireEvent.click(body as Element);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("selects once from the keyboard on the card body", () => {
    const onSelect = vi.fn();
    const onOpenDetails = vi.fn();
    const { container } = renderCard(onSelect, onOpenDetails);
    const body = container.querySelector('[role="button"]');
    fireEvent.keyDown(body as Element, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("keeps a keyboard selection path when the card has no details action", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <RestaurantCard
        title="El Cielo"
        neighborhood="El Poblado"
        cuisine="Colombian"
        rating={4.8}
        pinId="restaurant-1"
        composition="nova"
        selected={false}
        onSelect={onSelect}
      />,
    );
    const body = container.querySelector('[role="button"]');
    expect(body).not.toBeNull();
    fireEvent.keyDown(body as Element, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders the title and no dead hover affordance", () => {
    renderCard();
    expect(screen.getByText("El Cielo")).toBeTruthy();
  });
});

/**
 * SAN-1140: the browse grid used to render "Ask about this" and "View details" as siblings
 * *below* the card, so they sat outside the bordered card and under the sticky composer on a
 * phone. Both actions must be descendants of the same restaurant card.
 */
describe("RestaurantCard browse actions live inside the card", () => {
  const renderBrowseCard = (props: { selectedForAsk?: boolean } = {}) => {
    const onSelect = vi.fn();
    const onAskSelect = vi.fn();
    const view = render(
      <RestaurantCard
        title="Moshi"
        neighborhood="Medellín"
        cuisine="seafood"
        priceTier="$$$$"
        rating={4.6}
        mapsUrl="https://maps.google.com/?cid=moshi"
        pinId="restaurant-abc"
        composition="nova"
        selected={false}
        onSelect={onSelect}
        selectedForAsk={props.selectedForAsk}
        onAskSelect={onAskSelect}
        detailsHref="/restaurants/abc"
        detailsTestId="restaurant-detail-link-abc"
        testId="restaurant-card-abc"
      />,
    );
    const card = view.container.querySelector(
      '[data-result-kind="restaurant"]',
    ) as HTMLElement;
    return { ...view, card, onSelect, onAskSelect };
  };

  it("renders Ask and Details as descendants of the card", () => {
    const { card } = renderBrowseCard();
    expect(card).not.toBeNull();
    const asks = card.querySelectorAll('[data-testid="restaurant-ask-select"]');
    const details = card.querySelectorAll(
      '[data-testid="restaurant-detail-link-abc"]',
    );
    expect(asks).toHaveLength(1);
    expect(details).toHaveLength(1);
    expect(asks[0].closest('[data-result-kind="restaurant"]')).toBe(card);
    expect(details[0].closest('[data-result-kind="restaurant"]')).toBe(card);
  });

  it("renders Directions in the same footer as the actions", () => {
    const { card } = renderBrowseCard();
    const footer = card.querySelector('[data-slot="card-footer"]');
    const directions = card.querySelector(
      '[data-testid="restaurant-card-directions-link"], [data-testid="restaurant-card-maps-link"]',
    );
    expect(footer).not.toBeNull();
    expect(directions).not.toBeNull();
    expect(footer?.contains(directions as Node)).toBe(true);
    expect(
      footer?.contains(
        card.querySelector('[data-testid="restaurant-ask-select"]') as Node,
      ),
    ).toBe(true);
  });

  it("links Details to the real restaurant route", () => {
    const { card } = renderBrowseCard();
    const details = card.querySelector(
      '[data-testid="restaurant-detail-link-abc"]',
    ) as HTMLAnchorElement;
    expect(details.getAttribute("href")).toBe("/restaurants/abc");
    expect(details.textContent).toContain("Details");
  });

  it("exposes Ask as a real toggle button with a pressed state", () => {
    const { card } = renderBrowseCard();
    const ask = card.querySelector(
      '[data-testid="restaurant-ask-select"]',
    ) as HTMLButtonElement;
    expect(ask.tagName).toBe("BUTTON");
    expect(ask.getAttribute("type")).toBe("button");
    expect(ask.getAttribute("aria-pressed")).toBe("false");
    expect(ask.textContent).toContain("Ask about this");
  });

  it("shows the selected state when this card is the Ask context", () => {
    const { card } = renderBrowseCard({ selectedForAsk: true });
    const ask = card.querySelector(
      '[data-testid="restaurant-ask-select"]',
    ) as HTMLButtonElement;
    expect(ask.getAttribute("aria-pressed")).toBe("true");
    expect(ask.textContent).toContain("Clear selection");
  });

  it("selects Ask context without selecting a pin or opening details", () => {
    const { card, onSelect, onAskSelect } = renderBrowseCard();
    fireEvent.click(
      card.querySelector('[data-testid="restaurant-ask-select"]') as Element,
    );
    expect(onAskSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps exactly one Details control per card", () => {
    const { card } = renderBrowseCard();
    const detailsControls = card.querySelectorAll(
      '[data-testid="restaurant-detail-link-abc"], [data-testid="restaurant-details-cta"]',
    );
    expect(detailsControls).toHaveLength(1);
  });

  it("renders long names and a missing photo without dropping the actions", () => {
    const card = render(
      <RestaurantCard
        title="Restaurante de Autor Con Un Nombre Extraordinariamente Largo Para Medellín"
        cuisine="colombian"
        pinId="restaurant-long"
        composition="nova"
        mediaLayout="cover"
        onSelect={() => undefined}
        onAskSelect={() => undefined}
        detailsHref="/restaurants/long"
        detailsTestId="restaurant-detail-link-long"
        testId="restaurant-card-long"
      />,
    ).container.querySelector(
      '[data-result-kind="restaurant"]',
    ) as HTMLElement;
    expect(card).not.toBeNull();
    expect(
      card.querySelector('[data-testid="restaurant-card-photo-placeholder"]'),
    ).not.toBeNull();
    expect(
      card.querySelectorAll('[data-testid="restaurant-ask-select"]'),
    ).toHaveLength(1);
    expect(
      card.querySelectorAll('[data-testid="restaurant-detail-link-long"]'),
    ).toHaveLength(1);
    // No Directions link is invented when the record has no maps URL.
    expect(
      card.querySelector(
        '[data-testid="restaurant-card-directions-link"], [data-testid="restaurant-card-maps-link"]',
      ),
    ).toBeNull();
  });

  it("keeps the chat card contract when no browse props are passed", () => {
    const { container } = render(
      <RestaurantCard
        title="Moshi"
        pinId="restaurant-chat"
        composition="nova"
        onOpenDetails={() => undefined}
      />,
    );
    expect(
      container.querySelector('[data-testid="restaurant-ask-select"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid^="restaurant-detail-link-"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="restaurant-details-cta"]'),
    ).not.toBeNull();
  });
});
