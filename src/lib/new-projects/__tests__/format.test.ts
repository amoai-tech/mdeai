import { describe, expect, it } from "vitest";
import {
  NOT_PUBLISHED,
  formatArea,
  formatBedrooms,
  formatDelivery,
  formatPriceFromCents,
  formatPriceRangeLabel,
  formatUnitAreas,
  formatUnitTypeSummary,
  formatVerified,
  projectStatusLabel,
  toTestId,
  visLabel,
} from "@/lib/new-projects/format";
import type { NewProjectUnitType } from "@/lib/new-projects/types";

function unit(overrides: Partial<NewProjectUnitType> = {}): NewProjectUnitType {
  return {
    id: "u1",
    sourceKey: "arrayan-30m",
    name: "Apto 30 m²",
    bedrooms: 1,
    bathrooms: 1,
    builtAreaM2: 30,
    privateAreaM2: 22,
    priceFromCents: null,
    priceToCents: null,
    currency: "COP",
    availability: null,
    sourceKind: "developer",
    sourceUrl: "https://amarilo.com.co/proyecto/arrayan",
    verifiedAt: "2026-10-06T09:21:53Z",
    ...overrides,
  };
}

describe("format — prices never invent a value", () => {
  it("labels a single price-from as From, never an exact price", () => {
    expect(formatPriceFromCents(57500000000)).toBe("COP 575,000,000");
    expect(formatPriceRangeLabel(57500000000, null)).toBe("From COP 575,000,000");
  });

  it("renders a known range", () => {
    expect(formatPriceRangeLabel(37040637900, 83484317400)).toBe(
      "COP 370,406,379 – 834,843,174",
    );
  });

  it("renders an explicit unknown instead of zero", () => {
    expect(formatPriceRangeLabel(null, null)).toBe(NOT_PUBLISHED);
    expect(formatPriceFromCents(null)).toBeNull();
  });
});

describe("format — areas and rooms", () => {
  it("keeps built and private area distinct when both are known", () => {
    expect(formatUnitAreas(unit())).toBe("30 m² built · 22 m² private");
    expect(formatUnitAreas(unit({ privateAreaM2: null }))).toBe("30 m² built");
    expect(formatUnitAreas(unit({ builtAreaM2: null }))).toBe("22 m² private");
    expect(formatUnitAreas(unit({ builtAreaM2: null, privateAreaM2: null }))).toBe(NOT_PUBLISHED);
  });

  it("formats bedroom ranges and single values, and null when unknown", () => {
    expect(formatBedrooms(1, 2)).toBe("1–2 bedrooms");
    expect(formatBedrooms(3, 3)).toBe("3 bedrooms");
    expect(formatBedrooms(1, 1)).toBe("1 bedroom");
    expect(formatBedrooms(null, null)).toBeNull();
  });

  it("formats area and missing area", () => {
    expect(formatArea(129)).toBe("129 m²");
    expect(formatArea(null)).toBeNull();
  });
});

describe("format — status, delivery and evidence", () => {
  it("maps known project statuses and passes through unknown ones", () => {
    expect(projectStatusLabel("pre_sale")).toBe("Pre-sale · on plans");
    expect(projectStatusLabel("under_construction")).toBe("Under construction");
    expect(projectStatusLabel("weird")).toBe("weird");
    expect(projectStatusLabel(null)).toBeNull();
  });

  it("never presents an estimated note as an exact date", () => {
    expect(formatDelivery(2027, null, null)).toBe("Delivery 2027");
    expect(formatDelivery(2029, 3, null)).toBe("Delivery 2029 · Q3");
    expect(formatDelivery(null, null, "Estimada")).toBe("Delivery: Estimada");
    expect(formatDelivery(null, null, null)).toBe("Delivery date not published");
  });

  it("formats the verification date or says it is not verified", () => {
    expect(formatVerified("2026-10-06T09:21:53Z")).toBe("Verified 6 Oct 2026");
    expect(formatVerified(null)).toBe("Not yet verified");
  });

  it("builds ASCII, attribute-safe test ids from source-provided labels", () => {
    expect(toTestId("Ciudad del Río")).toBe("ciudad-del-rio");
    expect(toTestId("palma-129m-3br")).toBe("palma-129m-3br");
    expect(toTestId("Apto 30 m² / Torre A")).toBe("apto-30-m-torre-a");
    expect(toTestId("  --Nexus--  ")).toBe("nexus");
  });

  it("formats VIS and unit summary from partial data", () => {
    expect(visLabel(false)).toBe("Not VIS");
    expect(visLabel(null)).toBeNull();
    expect(formatUnitTypeSummary(unit())).toBe("30 m² · 1 bedroom · 1 bathroom");
    expect(formatUnitTypeSummary(unit({ builtAreaM2: null }))).toBe("1 bedroom · 1 bathroom");
    expect(
      formatUnitTypeSummary(
        unit({ builtAreaM2: null, bedrooms: null, bathrooms: null, priceFromCents: null }),
      ),
    ).toBe("Details not published");
  });
});
