import { describe, expect, it } from "vitest";
import { normalizeRestaurantIds } from "../contest-admin-ids";

describe("normalizeRestaurantIds", () => {
  it("keeps one value per multi-select pick", () => {
    expect(normalizeRestaurantIds(["a", "b"])).toEqual(["a", "b"]);
  });

  it("splits the comma-separated add-all value", () => {
    expect(normalizeRestaurantIds(["a,b,c"])).toEqual(["a", "b", "c"]);
  });

  it("deduplicates and drops blanks", () => {
    expect(normalizeRestaurantIds(["a", " a ", "", "a,b,", " , "])).toEqual(["a", "b"]);
  });

  it("returns nothing when no restaurant was chosen", () => {
    expect(normalizeRestaurantIds([])).toEqual([]);
    expect(normalizeRestaurantIds(["", "  "])).toEqual([]);
  });
});