import { describe, expect, it } from "vitest";
import { buildRentalFilterControlOps, RENTAL_FILTER_CONTROL_TARGET } from "../rental-filter-control-ui";
import { RENTAL_RECOMMENDATIONS_COMPONENTS } from "@/components/copilot/a2ui/rental-recommendations-surface";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { isRentalBedValue } from "@/components/rentals/rental-filter-draft";
import { resolveRentalPageControl } from "@/lib/rentals/browse-page-control";

describe("SAN-1655 rental filter control ops", () => {
  it("builds one versioned createSurface with the two interactive components", () => {
    const built = buildRentalFilterControlOps("rental-filters-t1");
    expect(built.target).toBe(RENTAL_FILTER_CONTROL_TARGET);
    expect(built.operations).toHaveLength(1);
    const op = built.operations[0] as { version: string; createSurface: { surfaceId: string; components: Array<Record<string, unknown>> } };
    expect(op.version).toBe("1.0");
    expect(op.createSurface.surfaceId).toBe("rental-filters-t1");
    expect(op.createSurface.components).toEqual([
      { id: "root", component: "Column", children: ["beds", "apply"] },
      { id: "beds", component: "BedroomFilter", label: "Bedrooms" },
      { id: "apply", component: "ApplyFiltersButton", label: "Apply filters" },
    ]);
  });

  it("only names components the panel allows and the catalog defines", () => {
    const built = buildRentalFilterControlOps("s1");
    const op = built.operations[0] as { createSurface: { components: Array<{ component: string }> } };
    for (const node of op.createSurface.components) {
      expect(RENTAL_RECOMMENDATIONS_COMPONENTS as readonly string[]).toContain(node.component);
      expect(mdeUI.components.has(node.component)).toBe(true);
    }
  });
});

describe("SAN-1655 native bedroom values", () => {
  it('accepts Studio as the native "0" and maps it to beds=0', () => {
    expect(isRentalBedValue("0")).toBe(true);
    expect(isRentalBedValue("studio")).toBe(false);
    const result = resolveRentalPageControl(
      { neighborhood: null, beds: "2", from: null, through: null },
      { beds: "0" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toContain("beds=0");
  });
});
