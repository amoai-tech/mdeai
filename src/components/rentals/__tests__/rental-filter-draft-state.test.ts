import { describe, expect, it } from "vitest";
import { isRentalBedValue, normalizeBedSelection } from "../rental-filter-draft";
import { resolveRentalPageControl } from "@/lib/rentals/browse-page-control";

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

describe("SAN-1655 Apply resolves through the existing page filter control", () => {
  it("changes only bedrooms and preserves unrelated URL filters", () => {
    const result = resolveRentalPageControl(
      { neighborhood: "Laureles", beds: "2", from: "2026-12-01", through: "2026-12-05" },
      { beds: "1" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toContain("neighborhood=Laureles");
    expect(result.url).toContain("beds=1");
    expect(result.url).toContain("from=2026-12-01");
    expect(result.url).toContain("through=2026-12-05");
  });

  it("rejects a value outside the native set", () => {
    const result = resolveRentalPageControl(
      { neighborhood: null, beds: null, from: null, through: null },
      { beds: "studio" },
    );
    expect(result.ok).toBe(false);
  });
});
