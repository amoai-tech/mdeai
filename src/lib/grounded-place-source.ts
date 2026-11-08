/** Origin of one displayed place, distinct from the legacy tool envelope's source. */
export const groundedPlaceSourceModes = [
  "google_grounding",
  "google_places",
  "saved_catalog",
  "demo_fixture",
] as const;

export type GroundedPlaceSourceMode = (typeof groundedPlaceSourceModes)[number];

export function isGroundedPlaceSourceMode(value: unknown): value is GroundedPlaceSourceMode {
  return groundedPlaceSourceModes.some((mode) => mode === value);
}

/** Never identify stored or test data as freshly Google-verified. */
export function groundedSourceLabel(
  sourceMode: GroundedPlaceSourceMode | undefined,
  hasGoogleGroundingAttribution = false,
): string | undefined {
  switch (sourceMode) {
    case "google_places": return "Google Maps place";
    case "google_grounding":
      return hasGoogleGroundingAttribution ? undefined : "Grounded search result";
    case "saved_catalog": return "Saved MDE catalog";
    case "demo_fixture": return "Demo example";
    default: return undefined;
  }
}

/** One source mapping for chat, discovery and map pins. */
export function groundedPinSource(
  sourceMode: GroundedPlaceSourceMode | undefined,
): "grounding" | "places" | "sql" | "mock" {
  switch (sourceMode) {
    case "google_places": return "places";
    case "saved_catalog": return "sql";
    case "demo_fixture": return "mock";
    default: return "grounding";
  }
}
