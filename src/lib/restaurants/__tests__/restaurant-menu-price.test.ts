import { describe, expect, it } from "vitest";
import { parseMenuPrice } from "@/lib/restaurants/restaurant-menu-price";
describe("restaurant menu price input", () => {
  it("keeps unknown prices unset and valid COP prices exact", () => {
    expect(parseMenuPrice("")).toBeNull();
    expect(parseMenuPrice("  ")).toBeNull();
    expect(parseMenuPrice("18000")).toBe(18000);
    expect(parseMenuPrice("18000.50")).toBe(18000.5);
  });
  it("rejects ambiguous Colombian price formats", () => {
    for (const input of ["18,000", "18.000", "$18000", "-1", "abc", "1.2345"]) {
      expect(() => parseMenuPrice(input)).toThrow(/digits/);
    }
  });
});
