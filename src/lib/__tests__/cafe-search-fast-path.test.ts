import { describe, expect, it } from "vitest";
import {
  buildCafeSearchParams,
  canFastPathCafeSearch,
  fastPathCafeSummary,
} from "../cafe-search-fast-path";

describe("cafe-search-fast-path", () => {
  it("matches specialty coffee queries", () => {
    expect(canFastPathCafeSearch("good specialty coffee in Laureles")).toBe(true);
    const params = buildCafeSearchParams("good specialty coffee in Laureles");
    expect(params?.neighborhood).toBe("Laureles");
    expect(params?.query).toContain("specialty coffee");
  });

  it("does not fast-path a follow-up about the cards already on screen", () => {
    expect(
      canFastPathCafeSearch(
        "Which of these cafés would you recommend for working with a laptop?",
      ),
    ).toBe(false);
    expect(canFastPathCafeSearch("Which one is quietest?")).toBe(false);
    expect(canFastPathCafeSearch("What about the first one?")).toBe(false);
    // A new discovery request still uses the fast path.
    expect(canFastPathCafeSearch("Quiet cafés near Laureles")).toBe(true);
  });

  it("does not match generic restaurant discovery", () => {
    expect(canFastPathCafeSearch("suggest restaurants medellin")).toBe(false);
  });

  it("passes intent nightlife for generic venues tonight (VEN-025)", () => {
    const q = "popular venues tonight in Provenza";
    expect(canFastPathCafeSearch(q)).toBe(true);
    expect(buildCafeSearchParams(q)).toMatchObject({
      intent: "nightlife",
      neighborhood: "El Poblado",
    });
    expect(fastPathCafeSummary(4, 4, "El Poblado", q)).toMatch(/nightlife venue/);
  });

  it("matches SCREEN-022 nightlife grounding query", () => {
    const q =
      "Salsa bars and rooftop cocktails locals go to in El Poblado";
    expect(canFastPathCafeSearch(q)).toBe(true);
    expect(buildCafeSearchParams(q)?.neighborhood).toBe("El Poblado");
    expect(fastPathCafeSummary(3, 3, "El Poblado", q)).toMatch(/nightlife venue/);
  });

  it("summarizes card count for Camila", () => {
    expect(fastPathCafeSummary(5, 5, "Laureles")).toMatch(/Found 5 specialty coffee shops/);
    expect(fastPathCafeSummary(0, 0)).toMatch(/No cafés matched/);
  });
});
