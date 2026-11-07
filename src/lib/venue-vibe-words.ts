import type { IntelligenceSlots } from "@/lib/intelligence-slots";

/**
 * The one list of venue "vibe" words: preferences a visitor expresses that the anchor ranking
 * understands through signal scores rather than literal text.
 *
 * Both sides of the guest search read it: the route decides which query words are ranked (not
 * required literally), and the composer decides what to call the results. Keeping it in one place
 * is what stops the label describing fewer preferences than the ranking actually used.
 */
export const VIBE_SLOT_LABELS: ReadonlyArray<readonly [keyof IntelligenceSlots, string]> = [
  ["wantsQuiet", "quiet"],
  ["wantsNomad", "wifi/workspace"],
  ["wantsRooftop", "rooftop"],
  ["wantsCocktails", "cocktails"],
  ["wantsBrunch", "brunch"],
  ["wantsDateNight", "date night"],
  ["wantsSalsa", "salsa"],
  ["wantsHiddenGem", "local favourites"],
  ["wantsAntiTouristy", "not touristy"],
  ["wantsValue", "value"],
  ["wantsService", "good service"],
  ["wantsSpecialtyCoffee", "specialty coffee"],
];

/** True when this single word sets any preference slot, i.e. the ranking can satisfy it. */
export function isVibeWord(word: string, slots: IntelligenceSlots): boolean {
  return VIBE_SLOT_LABELS.some(([flag]) => slots[flag] === true);
}

/** Human labels for the preferences present in a query, in a stable order. */
export function describePreferences(slots: IntelligenceSlots): string[] {
  return VIBE_SLOT_LABELS.filter(([flag]) => slots[flag] === true).map(([, label]) => label);
}
