import { searchText } from "@/mastra/lib/google-places-client";

/**
 * Minimal Places API (New) Text Search mask for the broker address picker.
 * Only the fields the onboarding form actually stores.
 */
export const RENTAL_ADDRESS_SEARCH_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
] as const;

export type PlaceSearchResult = {
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** Medellín bias center used when resolving broker addresses (maps skill anchor). */
const MEDELLIN_BIAS = { latitude: 6.2442, longitude: -75.5812 };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLocalizedText(value: unknown): string | null {
  const rec = asRecord(value);
  return readString(rec?.text);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Pure normalizer for a Places API (New) Text Search response.
 * Returns only entries that carry a provider place id; never invents fields.
 */
export function normalizePlaceSearchResponse(raw: unknown): PlaceSearchResult[] {
  const places = Array.isArray(asRecord(raw)?.places) ? (asRecord(raw)?.places as unknown[]) : [];
  const results: PlaceSearchResult[] = [];
  for (const entry of places) {
    const place = asRecord(entry);
    if (!place) continue;
    const placeId = readString(place.id);
    if (!placeId) continue;
    const location = asRecord(place.location);
    results.push({
      placeId,
      displayName: readLocalizedText(place.displayName),
      formattedAddress: readString(place.formattedAddress),
      latitude: readFiniteNumber(location?.latitude),
      longitude: readFiniteNumber(location?.longitude),
    });
  }
  return results;
}

/**
 * Resolve a broker-typed address to provider-backed candidates.
 * Returns [] for too-short queries; throws PlacesConfigError / PlacesRequestError
 * from the shared client otherwise.
 */
export async function searchRentalAddresses(query: string): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (q.length < 5) return [];
  const raw = await searchText({
    textQuery: q,
    pageSize: 5,
    languageCode: "es",
    regionCode: "CO",
    locationBias: { circle: { center: MEDELLIN_BIAS, radius: 50_000 } },
    fieldMask: RENTAL_ADDRESS_SEARCH_MASK,
  });
  return normalizePlaceSearchResponse(raw);
}
