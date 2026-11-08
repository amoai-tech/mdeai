/**
 * A question about amenities of currently shown café results, not a new
 * discovery request or the separate rental/room domain.
 */
export function isGroundedAmenityQuestion(text: string): boolean {
  // Accent-folding ensures Spanish and "café" match standard word boundaries.
  const q = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/\b(wi-?fi|wireless internet|internet|power[ -]?outlets?|outlets?|laptop|seating|enchufes?|tomacorrientes?|asientos?|sentarse)\b/.test(q)) {
    return false;
  }
  // Rental amenities are answered from their separately grounded listing facts.
  if (/\b(apartments?|rentals?|listings?|lodging|hotels?|rooms?|bedrooms?|apartamentos?|departamentos?|alojamientos?|habitacion|propiedad)\b/.test(q)) {
    return false;
  }
  // New requests for places must be sent to the existing search provider.
  if (/\b(find|show|search|looking for|busca(?:r|me)?|buscar|muestrame|encuentra|nuev[oa]s?)\b/.test(q) ||
      /\b(are there|is there|can you find|which cafes in|which cafes near|which coffee shops in|hay cafeterias|hay cafes)\b/.test(q)) {
    return false;
  }
  // A contextual "recommend" or "near" still describes a follow-up when
  // "these" or "which café" identifies the results on the screen.
  return /\b(this|that|these|those|them|they|their|which|do any|what about|cual|cuales|estos?|estas?|esos?|esas?|alguno|alguna|tienen|tiene)\b/.test(q);
}

/** Only structured facts for the requested amenity count; false is a fact. */
export function hasExplicitAmenity(
  rows: readonly Record<string, unknown>[],
  question?: string,
): boolean {
  const groups: string[][] = [];
  if (!question || /\b(wi-?fi|wireless internet|internet)\b/i.test(question)) {
    // Knowing that a café has Wi-Fi says nothing about its speed or reliability.
    if (question && /\b(reliable|fast|speed|stable|good|bueno|buena|buen|rapido|velocidad|estable|confiable)\b/i.test(question.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
      return false;
    }
    groups.push(["wifi", "hasWifi"]);
  }
  if (!question || /\b(power[ -]?outlets?|outlets?|enchufes?|tomacorrientes?)\b/i.test(question)) {
    groups.push(["powerOutlets", "hasPowerOutlets"]);
  }
  if (!question || /\b(seating|laptop|asientos?|sentarse)\b/i.test(question)) {
    groups.push(["seating", "outdoorSeating"]);
  }
  // A fact about café A never verifies café B. For a named café inspect
  // only its row; comparative questions need facts for every displayed café.
  const normalizedQuestion = question?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";
  const namedRows = question ? rows.filter((row) => {
    const name = typeof row.title === "string" ? row.title : "";
    const normalizedName = name.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return normalizedName.length >= 4 && normalizedQuestion.includes(normalizedName);
  }) : [];
  const checkedRows = namedRows.length ? namedRows : rows;
  const hasFact = (keys: string[]): boolean => checkedRows.length > 0 &&
    checkedRows.every((row) => keys.some((key) =>
      typeof row[key] === "boolean" ||
      (typeof row[key] === "string" && (row[key] as string).trim().length > 0)));
  return groups.length > 0 && (question ? groups.every(hasFact) : groups.some(hasFact));
}

export const GROUNDED_AMENITY_UNKNOWN_MESSAGE =
  "I don't have verified amenity information to answer that about the cafés currently shown, so I won't guess.";
