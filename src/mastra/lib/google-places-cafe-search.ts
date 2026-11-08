import {
  DEFAULT_TEXT_SEARCH_MASK,
  searchText,
} from "./google-places-client";
import type { GroundedPlaceResult } from "./map-adk-grounding-pins";

/** Text Search fields needed for cards + pins; no ratings/hours are invented. */
const CAFE_TEXT_SEARCH_MASK = [
  ...DEFAULT_TEXT_SEARCH_MASK,
  "places.primaryType",
] as const;

type GooglePlace = {
  id?: unknown;
  displayName?: { text?: unknown };
  location?: { latitude?: unknown; longitude?: unknown };
  googleMapsLinks?: {
    placeUri?: unknown;
    directionsUri?: unknown;
    reviewsUri?: unknown;
  };
  primaryType?: unknown;
  types?: unknown;
};

type GoogleTextSearchResponse = { places?: unknown };

export type GoogleCafeSearchResult = {
  results: GroundedPlaceResult[];
  attribution: Array<{ source: string; placeUri: string; title?: string }>;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function httpUrl(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isBarOrClub(place: GooglePlace): boolean {
  const primary = text(place.primaryType)?.toLowerCase();
  if (primary === "bar" || primary === "night_club" || primary === "liquor_store") {
    return true;
  }
  const types = Array.isArray(place.types)
    ? place.types.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase())
    : [];
  return types.some((t) => t === "bar" || t === "night_club" || t === "liquor_store");
}

/** Map the real Places Text Search response to the existing grounded card/pin contract. */
export function mapGoogleTextSearchToGrounded(response: unknown): GoogleCafeSearchResult {
  const places = (response as GoogleTextSearchResponse | null)?.places;
  if (!Array.isArray(places)) return { results: [], attribution: [] };

  const seen = new Set<string>();
  const results: GroundedPlaceResult[] = [];
  const attribution: GoogleCafeSearchResult["attribution"] = [];

  for (const raw of places) {
    if (!raw || typeof raw !== "object") continue;
    const place = raw as GooglePlace;
    if (isBarOrClub(place)) continue;
    const placeId = text(place.id);
    const title = text(place.displayName?.text);
    if (!placeId || !title || seen.has(placeId)) continue;
    seen.add(placeId);

    const mapsUrl = httpUrl(place.googleMapsLinks?.placeUri);
    const row: GroundedPlaceResult = {
      id: `google-${placeId}`,
      title,
      placeId,
      sourceMode: "google_places",
      latitude: finite(place.location?.latitude),
      longitude: finite(place.location?.longitude),
      mapsUrl,
      directionsUrl: httpUrl(place.googleMapsLinks?.directionsUri),
      reviewsUrl: httpUrl(place.googleMapsLinks?.reviewsUri),
      primaryType: text(place.primaryType),
    };
    results.push(row);
    if (mapsUrl) {
      attribution.push({ source: "Google Maps", placeUri: mapsUrl, title });
    }
  }
  return { results, attribution };
}

/**
 * Real Google café results through the already-installed Places SDK.
 * Used before ADK/MCP so Ask MDE does not depend on an absent sidecar.
 */
export async function searchGoogleCafes(params: {
  query: string;
  pageSize?: number;
  locationBias?: { latitude: number; longitude: number };
}): Promise<GoogleCafeSearchResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 5, 1), 5);
  const bias = params.locationBias
    ? {
        circle: {
          center: {
            latitude: params.locationBias.latitude,
            longitude: params.locationBias.longitude,
          },
          radius: 5000,
        },
      }
    : undefined;
  const response = await searchText({
    textQuery: params.query,
    pageSize,
    fieldMask: [...CAFE_TEXT_SEARCH_MASK],
    locationBias: bias,
  });
  return mapGoogleTextSearchToGrounded(response);
}
