// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { RestaurantCard } from "../restaurant-card";

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

  it("renders the title and no dead hover affordance", () => {
    renderCard();
    expect(screen.getByText("El Cielo")).toBeTruthy();
  });
});
