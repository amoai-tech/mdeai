// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { comparedRentalIds, ComparedRentalOptions } from "../rental-comparison-surface";
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
