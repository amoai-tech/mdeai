import { describe, expect, it } from "vitest";
import { rentalsToPanelRows } from "../rental-search-fast-path";

describe("rentalsToPanelRows comparison memory", () => {
  it("keeps the monthly price, currency, bedrooms and amenities a comparison needs", () => {
    const rows = rentalsToPanelRows([
      {
        id: "r1",
        title: "Calle 10 #42-15",
        neighborhood: "Laureles",
        nightly_price: 0,
        price_monthly: 2_400_000,
        currency: "COP",
        bedrooms: 2,
        amenities: ["Balcony"],
      },
    ] as Parameters<typeof rentalsToPanelRows>[0]);
    expect(rows?.[0]).not.toHaveProperty("nightly_price");
    expect(rows?.[0]).toMatchObject({
      id: "r1",
      price_monthly: 2_400_000,
      currency: "COP",
      bedrooms: 2,
      amenities: ["Balcony"],
    });
  });

  it("does not store unknown bedrooms or a zero nightly placeholder", () => {
    const rows = rentalsToPanelRows([
      {
        id: "r2",
        title: "External listing",
        neighborhood: "Laureles",
        nightly_price: 0,
        bedrooms: 0,
        bedrooms_unknown: true,
        currency: "COP",
      },
    ] as Parameters<typeof rentalsToPanelRows>[0]);
    expect(rows?.[0]).not.toHaveProperty("nightly_price");
    expect(rows?.[0]).not.toHaveProperty("bedrooms");
  });
});
