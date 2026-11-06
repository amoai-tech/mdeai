import { describe, expect, it } from "vitest";
import { countWithNoun } from "@/lib/format/count-with-noun";

/** A count shown above the grid must agree with the grid, in both flavours. */
describe("countWithNoun", () => {
  it("uses the singular for exactly one", () => {
    expect(countWithNoun(1, "café", "cafés")).toBe("1 café");
    expect(countWithNoun(1, "restaurant", "restaurants")).toBe("1 restaurant");
    expect(countWithNoun(1, "nightlife venue", "nightlife venues")).toBe("1 nightlife venue");
  });

  it("uses the plural for zero and many", () => {
    expect(countWithNoun(0, "café", "cafés")).toBe("0 cafés");
    expect(countWithNoun(17, "café", "cafés")).toBe("17 cafés");
    expect(countWithNoun(13, "nightlife venue", "nightlife venues")).toBe("13 nightlife venues");
  });
});
