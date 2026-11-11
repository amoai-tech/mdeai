import { describe, expect, it } from "vitest";
import { geoDistanceMeters } from "../geo-distance";

const LAURELES = { lat: 6.2503288, lng: -75.5915126 };

describe("geoDistanceMeters", () => {
  it("is zero for the same point", () => {
    expect(geoDistanceMeters(LAURELES, LAURELES)).toBe(0);
  });

  it("matches a known short Medellín distance within a metre", () => {
    // First Cup For For Free, from the production Nearby response.
    expect(
      geoDistanceMeters(LAURELES, { lat: 6.250994, lng: -75.5911248 }),
    ).toBeCloseTo(85, 0);
  });

  it("is symmetric and positive", () => {
    const a = { lat: 6.2442, lng: -75.5812 };
    const b = { lat: 6.2503, lng: -75.5915 };
    expect(geoDistanceMeters(a, b)).toBe(geoDistanceMeters(b, a));
    expect(geoDistanceMeters(a, b)).toBeGreaterThan(0);
  });
});
