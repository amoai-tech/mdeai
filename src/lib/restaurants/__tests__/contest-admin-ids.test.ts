import { describe, expect, it } from "vitest";
import { normalizeRestaurantIds } from "../contest-admin-ids";

const A = "a1526000-0000-4000-8000-000000000001";
const B = "a1526000-0000-4000-8000-000000000002";
const C = "a1526000-0000-4000-8000-000000000003";

describe("normalizeRestaurantIds", () => {
  it("keeps one value per multi-select pick", () => {
    expect(normalizeRestaurantIds([A, B])).toEqual({ ids: [A, B], rejected: 0 });
  });

  it("splits the comma-separated add-all value", () => {
    expect(normalizeRestaurantIds([A + "," + B + "," + C])).toEqual({ ids: [A, B, C], rejected: 0 });
  });

  it("deduplicates and drops blanks", () => {
    expect(normalizeRestaurantIds([A, " " + A + " ", "", A + "," + B + ",", " , "])).toEqual({
      ids: [A, B],
      rejected: 0,
    });
  });

  it("rejects a non-uuid instead of sending it to the RPC", () => {
    const result = normalizeRestaurantIds([A, "not-a-uuid", "12345", A + ",oops"]);
    expect(result.ids).toEqual([A]);
    expect(result.rejected).toBe(3);
  });

  it("returns nothing when no restaurant was chosen", () => {
    expect(normalizeRestaurantIds([])).toEqual({ ids: [], rejected: 0 });
    expect(normalizeRestaurantIds(["", "  "])).toEqual({ ids: [], rejected: 0 });
  });
});