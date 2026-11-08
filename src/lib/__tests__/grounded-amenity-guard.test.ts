import { describe, expect, it } from "vitest";
import { hasExplicitAmenity, isGroundedAmenityQuestion } from "../grounded-amenity-guard";

describe("grounded amenity guard", () => {
  it("matches follow-up Wi-Fi/outlet questions", () => {
    expect(isGroundedAmenityQuestion("Which café has reliable Wi-Fi?")).toBe(true);
    expect(isGroundedAmenityQuestion("Do these have power outlets?")).toBe(true);
  });

  it("does not block a new search", () => {
    expect(isGroundedAmenityQuestion("Find cafés with Wi-Fi in Laureles")).toBe(false);
    expect(isGroundedAmenityQuestion("Show cafés with laptop seating")).toBe(false);
  });

  it("recognizes only structured amenity facts", () => {
    expect(hasExplicitAmenity([{ title: "Café Euge" }])).toBe(false);
    expect(hasExplicitAmenity([{ title: "Café Euge", wifi: true }])).toBe(true);
  });
});
