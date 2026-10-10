import { describe, expect, it } from "vitest";
import {
  buildNewProjectFastPathParams,
  looksLikeNewProjectQuery,
} from "@/lib/new-projects/fast-path";

describe("new-project fast path classifier", () => {
  it("matches natural new-project phrasing, including words before 'projects'", () => {
    expect(looksLikeNewProjectQuery("new 2 bedroom projects in Laureles under 900 million")).toBe(true);
    expect(looksLikeNewProjectQuery("show me new construction in Ciudad del Río")).toBe(true);
    expect(looksLikeNewProjectQuery("proyectos nuevos en El Poblado")).toBe(true);
    expect(looksLikeNewProjectQuery("apartamentos nuevos en preventa")).toBe(true);
    expect(looksLikeNewProjectQuery("new condo in Laureles")).toBe(true);
    expect(looksLikeNewProjectQuery("show me new condos")).toBe(true);
    expect(looksLikeNewProjectQuery("new apartments in Laureles")).toBe(true);
  });

  it("does not claim rentals, events or restaurants", () => {
    expect(looksLikeNewProjectQuery("1BR apartment in Laureles under 80 dollars per night")).toBe(false);
    expect(looksLikeNewProjectQuery("salsa events this weekend")).toBe(false);
    expect(looksLikeNewProjectQuery("suggest restaurants medellin")).toBe(false);
  });

  it("does not claim adjacent non-real-estate domains", () => {
    expect(looksLikeNewProjectQuery("new project ideas for my startup")).toBe(false);
    expect(looksLikeNewProjectQuery("new project management tools")).toBe(false);
    expect(looksLikeNewProjectQuery("new condo cleaning tips")).toBe(false);
  });

  it("parses formatted price amounts correctly", () => {
    // Thousands are stripped, so both separators mean the same magnitude.
    expect(buildNewProjectFastPathParams("new projects under 1,200 million").maxPriceCop).toBe(1200000000);
    expect(buildNewProjectFastPathParams("new projects under 1.200 million").maxPriceCop).toBe(1200000000);
    expect(buildNewProjectFastPathParams("new projects under 1,234,567 million").maxPriceCop).toBe(1234567000000);
    expect(buildNewProjectFastPathParams("new projects under 1,2 million").maxPriceCop).toBe(1200000);
  });

  it("extracts hard filters and never invents one", () => {
    expect(buildNewProjectFastPathParams("new 2 bedroom projects in Laureles under 900 million")).toEqual({
      limit: 5,
      neighborhood: "Laureles",
      bedroomsExact: 2,
      maxPriceCop: 900000000,
    });
    expect(buildNewProjectFastPathParams("2+ bedroom new projects under 600 million")).toEqual({
      limit: 5,
      minBedrooms: 2,
      maxPriceCop: 600000000,
    });
    expect(buildNewProjectFastPathParams("new projects")).toEqual({ limit: 5 });
  });

  it("does not treat a bare announcement year as a delivery filter", () => {
    expect(buildNewProjectFastPathParams("new projects announced in 2025")).toEqual({ limit: 5 });
    expect(buildNewProjectFastPathParams("new projects delivering in 2027")).toEqual({
      limit: 5,
      deliveryYear: 2027,
    });
    expect(buildNewProjectFastPathParams("new projects with 2028 delivery")).toEqual({
      limit: 5,
      deliveryYear: 2028,
    });
  });

  it("qualifies bedrooms only next to the bedroom phrase", () => {
    // "3+ cars" is unrelated, so 2 bedrooms stays exact.
    expect(buildNewProjectFastPathParams("new 2 bedroom condos with 3+ parking spots")).toEqual({
      limit: 5,
      bedroomsExact: 2,
    });
    expect(buildNewProjectFastPathParams("new 2+ bedroom condos")).toEqual({
      limit: 5,
      minBedrooms: 2,
    });
    expect(buildNewProjectFastPathParams("new projects with at least 3 bedrooms")).toEqual({
      limit: 5,
      minBedrooms: 3,
    });
  });
});
