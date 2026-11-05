import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { findRentalRow, mdeUI } from "../mde-ui-catalog";

describe("MDE A2UI catalog", () => {
  it("exports a small, versioned catalog with only RentalCard", () => {
    expect(mdeUI.id).toBe("mde/discovery@1");
    expect([...mdeUI.components.keys()]).toEqual(["RentalCard"]);
  });

  it("resolves only ids present in the latest authorized result", () => {
    const result = {
      results: [
        { id: "real-1", title: "Bright 2BR", neighborhood: "Laureles", price_monthly: 3_800_000, currency: "COP" },
      ],
    };
    expect(findRentalRow(result, "real-1")).toMatchObject({ title: "Bright 2BR" });
    expect(findRentalRow(result, "forged-id")).toBeNull();
    expect(findRentalRow(result, "0")).toBeNull();
    expect(findRentalRow(null, "real-1")).toBeNull();
  });

  it("accepts only a non-empty opaque listingId", () => {
    const props = mdeUI.components.get("RentalCard")?.props as z.ZodTypeAny | undefined;
    expect(props).toBeDefined();
    expect(props?.safeParse({ listingId: "external-listing-42" }).success).toBe(true);
    expect(props?.safeParse({ listingId: "" }).success).toBe(false);
    expect(props?.safeParse({ listingId: 42 }).success).toBe(false);
    expect(props?.safeParse({ price: 2_400_000 }).success).toBe(false);
  });
});
