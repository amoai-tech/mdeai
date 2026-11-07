import { describe, expect, it } from "vitest";
import { parseIntelligenceSlots } from "@/lib/intelligence-slots";
import { parseAnchorIntelligenceSlots } from "@/mastra/lib/intelligence-anchor-search";
import { describePreferences, hasAnyVibeSlot } from "@/lib/venue-vibe-words";

/**
 * The shared list has two jobs: tell the route which words are ranked (not demanded literally),
 * and tell the composer what to call the results. A gap on one side is a lie on the other.
 */
describe("venue vibe words", () => {
  it("recognises the nightlife words the venue parser understands", () => {
    // Regression: without wantsNightlife these were required to appear literally in a name or tag,
    // so "salsa party tonight" could return nothing.
    for (const word of ["party", "parties", "tonight", "discotec", "nightlife"]) {
      const slots = parseAnchorIntelligenceSlots(word, "nightclub");
      expect(hasAnyVibeSlot(slots), `${word} should count as a preference`).toBe(true);
    }
  });

  it("does not treat an ordinary word as a preference", () => {
    expect(hasAnyVibeSlot(parseAnchorIntelligenceSlots("Pergamino", "cafe"))).toBe(false);
    expect(hasAnyVibeSlot(parseAnchorIntelligenceSlots("Laureles", "cafe"))).toBe(false);
  });

  it("describes every preference the client-side parser can produce", () => {
    // The client only uses the base parser, so this is the set its labels must cover.
    const slots = parseIntelligenceSlots("quiet rooftop cocktails brunch date night salsa value");
    expect(describePreferences(slots)).toEqual([
      "quiet",
      "rooftop",
      "cocktails",
      "brunch",
      "date night",
      "salsa",
      "value",
    ]);
  });

  it("describes nothing for a plain name query", () => {
    expect(describePreferences(parseIntelligenceSlots("Pergamino Laureles"))).toEqual([]);
  });
});
