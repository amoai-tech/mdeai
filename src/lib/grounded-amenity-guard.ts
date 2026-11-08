/** Questions about amenities that the grounded result schema does not carry. */
export function isGroundedAmenityQuestion(text: string): boolean {
  if (!/\b(wi-?fi|wireless internet|internet|power outlets?|outlets?|laptop|seating)\b/i.test(text)) {
    return false;
  }
  // A new search must reach the provider, not be answered from old rows.
  if (/\b(find|show|search|near|around|recommend|looking for|suggest)\b/i.test(text)) {
    return false;
  }
  return /\b(which|what|does|do|has|have|is|are|can)\b/i.test(text);
}

/** True only when a row carries a structured amenity fact. */
export function hasExplicitAmenity(rows: readonly Record<string, unknown>[]): boolean {
  return rows.some((row) =>
    ["wifi", "hasWifi", "powerOutlets", "hasPowerOutlets", "seating", "outdoorSeating"]
      .some((key) => row[key] !== undefined),
  );
}

export const GROUNDED_AMENITY_UNKNOWN_MESSAGE =
  "I don't have verified Wi-Fi, power-outlet or seating details for these places. The current results only include name, area, rating and map facts — I won't guess.";
