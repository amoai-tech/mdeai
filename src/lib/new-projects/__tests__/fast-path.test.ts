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
  });

  it("does not claim rentals, events or restaurants", () => {
    expect(looksLikeNewProjectQuery("1BR apartment in Laureles under 80 dollars per night")).toBe(false);
    expect(looksLikeNewProjectQuery("salsa events this weekend")).toBe(false);
    expect(looksLikeNewProjectQuery("suggest restaurants medellin")).toBe(false);
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
});
