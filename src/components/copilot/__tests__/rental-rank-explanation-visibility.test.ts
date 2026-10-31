import { describe, expect, it } from "vitest";
import { buildMatchReason } from "@/lib/rental-display";

describe("rental match explanation visibility", () => {
  it("uses listing facts and requested filters instead of internal search diagnostics", () => {
    const text = buildMatchReason(
      {
        id: "laureles-2br",
        title: "Apartamento en Laureles",
        neighborhood: "Laureles",
        bedrooms: 2,
        tags: ["long-stay"],
      },
      { neighborhood: "Laureles", minBedrooms: 2 },
    );

    expect(text).toBe("In Laureles · 2 BR, as you asked · Long-stay");
    expect(text).not.toMatch(/hybrid_semantic|hybrid_search_listings|neighborhood_profile|RPC/);
  });

  it("does not invent a fit explanation when no matching facts are known", () => {
    expect(
      buildMatchReason(
        { id: "unknown", title: "Apartment", neighborhood: "" },
        {},
      ),
    ).toBe("");
  });
});
