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

    expect(text).toBe("In Laureles · 2 BR, as you asked · Long-stay listed");
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


describe("rental explanation factual boundaries", () => {
  const listing = { id: "apt", title: "Rental", neighborhood: "Laureles", bedrooms: 2, nightly_price: 75, currency: "USD", wifi: true };
  it("shows known neighborhood, size, actual USD nightly price and listing-provided amenity", () => {
    expect(buildMatchReason(listing, { neighborhood: "Laureles", minBedrooms: 2, maxPricePerNight: 80 }))
      .toBe("In Laureles · 2 BR, as you asked · $75/night within your $80/night budget · Wi-Fi listed");
  });
  it("never calls an unrelated neighborhood a match", () => {
    expect(buildMatchReason({ ...listing, neighborhood: "Envigado" }, { neighborhood: "Laureles" }))
      .toBe("Wi-Fi listed");
  });
  it("does not compare COP values with a USD nightly budget or invent Wi-Fi speed", () => {
    const reason = buildMatchReason({ ...listing, nightly_price: 75, currency: "COP" }, { maxPricePerNight: 80 });
    expect(reason).toBe("Wi-Fi listed");
    expect(reason).not.toMatch(/fast|budget/i);
  });
  it("uses stored monthly COP amount only against a COP monthly cap", () => {
    const monthly = { ...listing, nightly_price: undefined, price_monthly: 2_800_000, currency: "COP" };
    expect(buildMatchReason(monthly, { maxPriceMonthly: 3_500_000, budgetCurrency: "COP" }))
      .toContain("COP 2,800,000/month within your COP 3,500,000/month budget");
    expect(buildMatchReason(monthly, { maxPriceMonthly: 3_500_000, budgetCurrency: "USD" }))
      .not.toMatch(/budget/);
    expect(buildMatchReason(monthly, { maxPricePerNight: 80 })).not.toMatch(/budget/);
  });
  it("omits bedroom match if listing marks bedroom count unknown or too small", () => {
    expect(buildMatchReason({ ...listing, bedrooms_unknown: true }, { minBedrooms: 2 })).toBe("Wi-Fi listed");
    expect(buildMatchReason({ ...listing, bedrooms: 1 }, { minBedrooms: 2 })).toBe("Wi-Fi listed");
  });
  it("does not claim Wi-Fi when a listing explicitly says it is absent", () => {
    expect(buildMatchReason({ ...listing, wifi: false, amenities: ["wifi"] })).toBe("");
  });
  it("does not invent quietness, security or remote-work suitability from tags", () => {
    const reason = buildMatchReason({ ...listing, wifi: false, tags: ["quiet", "safe", "remote work"] });
    expect(reason).toBe("");
  });
});
