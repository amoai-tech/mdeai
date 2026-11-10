import { describe, expect, it } from "vitest";
import { isRentalBedValue, normalizeBedSelection } from "../rental-filter-draft";

describe("SAN-1655 bedroom selection", () => {
  it("treats empty and whitespace as Any, never a bedroom count", () => {
    expect(normalizeBedSelection("")).toBeNull();
    expect(normalizeBedSelection("   ")).toBeNull();
    expect(normalizeBedSelection("0")).toBe("0");
  });

  it("accepts only the native values", () => {
    for (const value of ["0", "1", "2", "3"]) expect(isRentalBedValue(value)).toBe(true);
    expect(isRentalBedValue("studio")).toBe(false);
    expect(isRentalBedValue("")).toBe(false);
  });
});
