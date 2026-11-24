// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { comparedRentalIds, comparisonMatchesCurrentResults, ComparedRentalOptions } from "../rental-comparison-surface";
import { buildComparisonTableOps, type ComparisonRow } from "@/mastra/lib/comparison-table-ui";
import type { Rental } from "@/mastra/tools/search-rentals";

const row = (id: string): ComparisonRow => ({
  id, title: id, neighborhood: "Laureles", bedrooms: 2, furnished: true,
  bathrooms: 1, sizeSqm: 70, wifiSpeedMbps: null, amenities: [],
  priceMonthly: 2400000, priceNightly: null, currency: "COP",
});

describe("official comparison surface identity bridge", () => {
  const ops = buildComparisonTableOps([row("b"), row("a")], undefined, { target: "rental-comparison" })!.operations;

  it("uses table order instead of browse order, and rejects stale IDs", () => {
    expect(comparedRentalIds(ops, ["a", "b", "c"])).toEqual(["b", "a"]);
    expect(comparedRentalIds(ops, ["a", "c"])).toEqual([]);
    expect(comparedRentalIds(ops, ["a"])).toEqual([]);
    expect(comparedRentalIds([], ["a", "b"])).toEqual([]);
  });

  it("rejects malformed nested actions and ignores arbitrary media in the surface", () => {
    const { createSurface } = ops[0] as { createSurface: { surfaceId: string; components: Array<Record<string, unknown>> } };
    const mutate = (onClick: unknown) => [{ createSurface: {
      ...createSurface,
      components: createSurface.components.map((node) =>
        node.id === "comparison-details-0" ? { ...node, onClick } : node),
    } }];
    for (const value of [null, [], "bad", { functionCall: null }, { functionCall: { args: null } },
      { functionCall: { "@call": "openComparedRentalDetails", args: { listingId: ["b"] } } },
      { functionCall: { "@call": "openComparedRentalDetails", args: { listingId: "not-visible" } } }]) {
      expect(comparedRentalIds(mutate(value), ["a", "b"])).toEqual([]);
    }
    expect(comparedRentalIds([null, 1, { updateComponents: null }], ["a", "b"])).toEqual([]);
  });

  it("supports the committed create plus component-update operation shape", () => {
    const { createSurface } = ops[0] as { createSurface: { surfaceId: string; components: unknown[] } };
    const { components, surfaceId } = createSurface;
    const split = [
      { createSurface: { surfaceId } },
      { updateComponents: { surfaceId, components } },
    ];
    expect(comparedRentalIds(split, ["a", "b"])).toEqual(["b", "a"]);
    expect(comparedRentalIds([...split, { deleteSurface: { surfaceId } }], ["a", "b"])).toEqual([]);
  });

  it("withholds stale prices and every changed recorded fact even when IDs are unchanged", () => {
    const results = ["a", "b"].map((id) => ({ id, comparison_facts: row(id) })) as Rental[];
    expect(comparisonMatchesCurrentResults(ops, ["b", "a"], results)).toBe(true);
    for (const change of [
      { priceMonthly: 3100000 }, { bathrooms: 2 }, { sizeSqm: 80 },
      { wifiSpeedMbps: 300 }, { amenities: ["Balcony"] }, { furnished: false },
      { priceNightly: 150000 }, { currency: "USD" }, { title: "Updated title" },
    ]) {
      const updated = [results[0], { ...results[1], comparison_facts: { ...row("b"), ...change } }];
      expect(comparedRentalIds(ops, updated.map((r) => r.id))).toEqual(["b", "a"]);
      expect(comparisonMatchesCurrentResults(ops, ["b", "a"], updated)).toBe(false);
      const fresh = buildComparisonTableOps([updated[1].comparison_facts!, row("a")], undefined, { target: "rental-comparison" })!;
      expect(comparisonMatchesCurrentResults(fresh.operations, ["b", "a"], updated)).toBe(true);
    }
    expect(comparisonMatchesCurrentResults(ops, ["b", "a"], [results[0], { id: "b" } as Rental])).toBe(false);
    const { createSurface } = ops[0] as { createSurface: { components: Array<Record<string, unknown>> } };
    const badSummary = [{ createSurface: { ...createSurface, components: createSurface.components.map((node) =>
      node.id === "comparison-summary" ? { ...node, text: "Stale cheapest price" } : node) } }];
    expect(comparisonMatchesCurrentResults(badSummary, ["b", "a"], results)).toBe(false);
  });

  it("keeps the compared apartment Ask-select controls visible and clearable", () => {
    const results = ["a", "b"].map((id) => ({ id, title: id, neighborhood: "Laureles", image: "" })) as Rental[];
    const select = vi.fn();
    const { rerender } = render(<ComparedRentalOptions ids={["a", "b"]} results={results} selectedPinId={null}
      onSelectMap={vi.fn()} selectedForAskId="a" onAskSelect={select} />);
    const clear = screen.getByRole("button", { name: "Clear selection" });
    expect(clear).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(clear);
    expect(select).toHaveBeenLastCalledWith(results[0]);
    fireEvent.click(screen.getByRole("button", { name: "Ask about this" }));
    expect(select).toHaveBeenLastCalledWith(results[1]);
    rerender(<ComparedRentalOptions ids={["a", "b"]} results={results} selectedPinId={null}
      onSelectMap={vi.fn()} selectedForAskId="b" onAskSelect={select} />);
    expect(screen.getByRole("button", { name: "Clear selection" }).closest("[data-listing-id]")).toHaveAttribute("data-listing-id", "b");
  });

  it("uses authorized photos and only offers map selection when coordinates validate", () => {
    const results = [
      { id: "a", title: "First", neighborhood: "Laureles", image: "https://images.unsplash.com/one.jpg", latitude: 6.24, longitude: -75.59 },
      { id: "b", title: "Second", neighborhood: "Laureles", image: "https://untrusted.invalid/photo.jpg", latitude: null, longitude: null },
    ] as Rental[];
    const select = vi.fn();
    render(<ComparedRentalOptions ids={["a", "b"]} results={results} selectedPinId="rental-a" onSelectMap={select} />);
    expect(screen.getByRole("img", { name: "First" })).toHaveAttribute("src", results[0].image);
    expect(screen.queryByRole("img", { name: "Second" })).toBeNull();
    expect(screen.getByText("Photo unavailable")).toBeVisible();
    expect(screen.getByText("Map location unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show compared apartment 1 on map" }));
    expect(select).toHaveBeenCalledExactlyOnceWith(results[0]);
  });
});
