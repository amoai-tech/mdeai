import {
  DEFAULT_TEXT_SEARCH_MASK,
  searchText,
} from "./google-places-client";
import type { GroundedPlaceResult } from "./map-adk-grounding-pins";

/** Text Search fields needed for cards + pins; no ratings/hours are invented. */
const CAFE_TEXT_SEARCH_MASK = [
  ...DEFAULT_TEXT_SEARCH_MASK,
  "places.primaryType",
  "places.types",
] as const;

export const MEDELLIN_BIAS = { latitude: 6.2442, longitude: -75.5812 };
const MAP_AREA_CONTEXT =
  /\b(this map area|around this map|current map|map area|near here|around here)\b/i;
const MEDELLIN_CONTEXT = /\b(medell[ií]n|laureles|poblado|envigado|sabaneta|bel[eé]n|provenza|estadio|centro)(?![\p{L}])/iu;
const EXPLICIT_CITY = /\b(bogot[aá]|cali|cartagena|barranquilla|santa marta|pereira|manizales|armenia|bucaramanga|c[uú]cuta|villavicencio|monter[ií]a|ibagu[eé]|pasto|neiva|popay[aá]n|sincelejo|valledupar|tunja|riohacha|quibd[oó]|florencia|yopal|mocoa|leticia|san andr[eé]s)(?![\p{L}])/iu;
const EXPLICIT_LOCATION_PHRASE = /\b(?:in|en|near|around|nearby)\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+/u;
const CAFE_TYPES = new Set(["cafe", "coffee_shop", "bakery", "brunch_restaurant"]);

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

/** Only Google Maps' exact HTTPS hosts are accepted for public result links. */
function validatedMapsUrl(candidate: unknown): string | undefined {
  const raw = text(candidate);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    if (url.hostname === "maps.google.com") return raw;
    if ((url.hostname === "google.com" || url.hostname === "www.google.com") &&
        (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) return raw;
  } catch {
    return undefined;
  }
  return undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function placeTypes(place: GooglePlace): string[] {
  const raw = Array.isArray(place.types)
    ? place.types.filter((t): t is string => typeof t === "string")
    : [];
  const primary = text(place.primaryType);
  return [...(primary ? [primary] : []), ...raw].map((t) => t.toLowerCase());
}

function isBarOrClub(place: GooglePlace): boolean {
  const types = placeTypes(place);
  return types.some((t) => t === "bar" || t === "night_club" || t === "liquor_store");
}

function isCafe(place: GooglePlace): boolean {
  return placeTypes(place).some((t) => CAFE_TYPES.has(t));
}

/** True when the query names a Medellín city/neighborhood rather than another city. */
export function isMedellinPlaceScope(query: string): boolean {
  // "centro de Bogotá" contains "centro", but the explicit city wins.
  return !EXPLICIT_CITY.test(query) && MEDELLIN_CONTEXT.test(query);
}

/** True only for an explicit city outside Medellín. */
export function hasNonMedellinCity(query: string): boolean {
  return EXPLICIT_CITY.test(query);
}

/** True when the user named a real city, neighborhood or location phrase. */
export function hasExplicitPlaceScope(query: string): boolean {
  return (
    MEDELLIN_CONTEXT.test(query) ||
    EXPLICIT_CITY.test(query) ||
    EXPLICIT_LOCATION_PHRASE.test(query)
  );
}

/** Add Medellín context when the user did not name a city/neighborhood. */
export function isMapAreaQuery(query: string): boolean {
  return MAP_AREA_CONTEXT.test(query);
}

export function withMedellinScope(query: string, hasMapBias = false): string {
  if (hasExplicitPlaceScope(query) || isMapAreaQuery(query) || hasMapBias) return query;
  return `${query} Medellín, Colombia`;
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
    if (isBarOrClub(place) || !isCafe(place)) continue;
    const placeId = text(place.id);
    const title = text(place.displayName?.text);
    const mapsUrl = validatedMapsUrl(place.googleMapsLinks?.placeUri);
    if (!placeId || !title || !mapsUrl || seen.has(placeId)) continue;
    seen.add(placeId);
    const latitude = finite(place.location?.latitude);
    const longitude = finite(place.location?.longitude);
    const hasPosition = latitude !== undefined && longitude !== undefined &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

    results.push({
      id: `google-${placeId}`,
      title,
      placeId,
      sourceMode: "google_places",
      latitude: hasPosition ? latitude : undefined,
      longitude: hasPosition ? longitude : undefined,
      mapsUrl,
      directionsUrl: validatedMapsUrl(place.googleMapsLinks?.directionsUri),
      reviewsUrl: validatedMapsUrl(place.googleMapsLinks?.reviewsUri),
      primaryType: text(place.primaryType),
    });
    attribution.push({ source: "Google Maps", placeUri: mapsUrl, title });
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
  locationBias?: { latitude: number; longitude: number } | null;
}): Promise<GoogleCafeSearchResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 5, 1), 5);
  const center =
    params.locationBias === null
      ? undefined
      : params.locationBias ?? MEDELLIN_BIAS;
  const response = await searchText({
    textQuery: withMedellinScope(params.query, Boolean(params.locationBias)),
    pageSize,
    fieldMask: [...CAFE_TEXT_SEARCH_MASK],
    maxAttempts: 1,
    ...(center ? { locationBias: { circle: { center, radius: 5000 } } } : {}),
  });
  return mapGoogleTextSearchToGrounded(response);
}
