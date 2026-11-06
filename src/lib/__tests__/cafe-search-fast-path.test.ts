import { isSelectedRentalCafeNearbyRequest, isStoredRentalUuid, nearbyCafeRadiusMeters } from "@/lib/cafe-search-fast-path";
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

describe("SAN-106 selected rental Nearby classification", () => {
  it("recognizes selected apartment café intent before rental routing", () => {
    expect(isSelectedRentalCafeNearbyRequest("Show cafés within 800 meters of this apartment")).toBe(true);
    expect(isSelectedRentalCafeNearbyRequest("Find coffee shops near this rental")).toBe(true);
  });
  it("leaves unrelated rentals and cafés alone", () => {
    expect(isSelectedRentalCafeNearbyRequest("Find 2BR apartments in Laureles")).toBe(false);
    expect(isSelectedRentalCafeNearbyRequest("Find cafés in Laureles")).toBe(false);
  });
});

describe("SAN-106 stored rental and radius truth", () => {
  it("accepts actual UUID rental identifiers, not external slug pins", () => {
    expect(isStoredRentalUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isStoredRentalUuid("grand-by-linares")).toBe(false);
  });
  it("preserves user-requested distance and rejects unsafe or unsupported amounts", () => {
    expect(nearbyCafeRadiusMeters("Show cafés within 300 meters of this apartment")).toBe(300);
    expect(nearbyCafeRadiusMeters("Find cafés within 2 km of this apartment")).toBe(2000);
    expect(nearbyCafeRadiusMeters("Find cafés within 1.5 km of this apartment")).toBe(1500);
    expect(nearbyCafeRadiusMeters("Find cafés within 1.2345 km of this apartment")).toBe(1235);
    expect(nearbyCafeRadiusMeters("Find cafés within 350.5 m of this apartment")).toBe(351);
    expect(nearbyCafeRadiusMeters("Show cafés near this apartment")).toBe(800);
    expect(nearbyCafeRadiusMeters("Show cafés within 90000 meters")).toBeNull();
    expect(nearbyCafeRadiusMeters("Show cafés within 2 miles")).toBeNull();
  });
});
