import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isStoredRentalUuid } from "@/lib/cafe-search-fast-path";
import { DEFAULT_NEARBY_SEARCH_MASK, searchNearby } from "../lib/google-places-client";
import { RENTAL_SUPABASE_KEY } from "./search-rentals";
import { getAuditUserId } from "../lib/tool-audit-context";

/**
 * SAN-106: Nearby is not a second discovery engine. It is a server-only Google
 * Places lookup from an RLS-visible rental, returning the existing grounded
 * results envelope for ToolPinsSync / GroundedCafeResults.
 */
export type NearbyRentalQuery = {
  rentalId: string;
  radiusMeters: number;
  limit: number;
};

type NearbyPlace = {
  id?: string | null;
  displayName?: { text?: string | null } | null;
  location?: { latitude?: number | null; longitude?: number | null } | null;
  googleMapsLinks?: { placeUri?: string | null } | null;
  googleMapsUri?: string | null;
  primaryType?: string | null;
};

export type NearbyRentalResult = {
  results: Array<{
    id: string;
    title: string;
    latitude: number;
    longitude: number;
    placeId: string;
    mapsUrl?: string;
    primaryType?: string;
  }>;
  attribution: Array<{ source: string; placeUri: string; title: string }>;
  source: "grounding";
  metadata: {
    searchMode: "nearby";
    anchorPinId: string;
    venueKind: "cafe";
    radiusMeters: number;
    provider: "google_places_nearby";
    reason?: string;
  };
};

/** Reject out-of-range or non-finite coordinates before Google requests. */
function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/** Only Google Maps' exact HTTPS hosts are accepted for public result links. */
function validatedMapsUrl(candidate: unknown): string | undefined {
  if (typeof candidate !== "string") return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    const hostname = url.hostname;
    if (hostname === "maps.google.com") return candidate;
    if ((hostname === "google.com" || hostname === "www.google.com") &&
        (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) {
      return candidate;
    }
  } catch {
    // Malformed or untrusted provider link: omit the link, keep the true place.
  }
  return undefined;
}

/** Normalize Google provider rows into safe, coordinate-ready, deduplicated cards. */
export function mapNearbyProviderPlaces(response: unknown): NearbyRentalResult["results"] {
  const raw = response && typeof response === "object"
    ? (response as { places?: unknown }).places : undefined;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const results: NearbyRentalResult["results"] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const place = value as NearbyPlace;
    const id = typeof place.id === "string" ? place.id.trim() : "";
    const title = typeof place.displayName?.text === "string"
      ? place.displayName.text.trim() : "";
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    if (!id || !title || seen.has(id) ||
        typeof latitude !== "number" || typeof longitude !== "number" ||
        !isValidCoordinate(latitude, longitude)) continue;
    seen.add(id);
    const mapsUrlCandidate = place.googleMapsLinks?.placeUri ?? place.googleMapsUri;
    const mapsUrl = validatedMapsUrl(mapsUrlCandidate);
    results.push({
      id, title, latitude, longitude, placeId: id,
      ...(mapsUrl ? { mapsUrl } : {}),
      ...(typeof place.primaryType === "string" && place.primaryType
        ? { primaryType: place.primaryType } : {}),
    });
  }
  return results;
}

/** Read the request-scoped RLS client without privileged or anonymous fallbacks. */
function readRlsRentalClient(context?: unknown): SupabaseClient<Database> | null {
  const outer = context as { requestContext?: unknown } | undefined;
  const requestContext = outer?.requestContext ?? context;
  const get = (requestContext as Partial<Pick<Map<string, unknown>, "get">> | undefined)?.get;
  const value = typeof get === "function"
    ? get.call(requestContext, RENTAL_SUPABASE_KEY)
    : undefined;
  return value && typeof (value as SupabaseClient<Database>).from === "function"
    ? value as SupabaseClient<Database> : null;
}

/**
 * Validate the server-derived user against the same RLS-scoped Supabase client.
 * A service bearer, a fabricated context ID, or an anonymous identity is not a
 * signed-in renter and must never reach the billable Nearby quota/provider.
 */
export async function hasVerifiedNearbyRentalUser(context?: unknown): Promise<boolean> {
  const userId = getAuditUserId(context);
  const client = readRlsRentalClient(context);
  if (!userId || !client || typeof client.auth?.getUser !== "function") return false;
  try {
    const { data: { user }, error } = await client.auth.getUser();
    return !error && user != null && !user.is_anonymous && user.id === userId;
  } catch {
    return false;
  }
}

/** Resolve an authorized rental location and perform one bounded Google Nearby query. */
export async function searchNearbyRentalPlaces(
  input: NearbyRentalQuery,
  context?: unknown,
): Promise<NearbyRentalResult> {
  const metadata: NearbyRentalResult["metadata"] = {
    searchMode: "nearby",
    anchorPinId: `rental-${input.rentalId}`,
    venueKind: "cafe",
    radiusMeters: input.radiusMeters,
    provider: "google_places_nearby",
  };
  const empty = (reason: string): NearbyRentalResult => ({
    results: [], attribution: [], source: "grounding",
    metadata: { ...metadata, reason },
  });

  // Tool schema guards this too; a direct invocation must not bypass validation.
  if (typeof input.rentalId !== "string" || input.rentalId.length !== 36 ||
      !isStoredRentalUuid(input.rentalId) ||
      !Number.isInteger(input.radiusMeters) || input.radiusMeters < 100 ||
      input.radiusMeters > 5000 || !Number.isInteger(input.limit) ||
      input.limit < 1 || input.limit > 10) {
    return empty("invalid_nearby_request");
  }

  // No anonymous fallback: only the request's user-scoped RLS client can
  // resolve the actual listing location. The tool verifies user identity first.
  const client = readRlsRentalClient(context);
  if (!client) return empty("rental_search_unavailable");

  const { data, error } = await client.from("apartments")
    .select("id, latitude, longitude")
    .eq("id", input.rentalId)
    .maybeSingle();
  if (error) return empty("rental_lookup_unavailable");
  if (data?.latitude == null || data?.longitude == null) {
    return empty("rental_has_no_accessible_coordinates");
  }

  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!isValidCoordinate(latitude, longitude)) {
    return empty("rental_has_no_accessible_coordinates");
  }

  try {
    const response = await searchNearby({
      locationRestriction: {
        circle: { center: { latitude, longitude }, radius: input.radiusMeters },
      },
      includedTypes: ["cafe", "coffee_shop"],
      rankPreference: "DISTANCE",
      pageSize: input.limit,
      // Use the existing, explicit Pro field mask. Never request wildcard data.
      fieldMask: DEFAULT_NEARBY_SEARCH_MASK,
    });
    const results = mapNearbyProviderPlaces(response).slice(0, input.limit);
    return {
      results,
      attribution: results.flatMap((row) =>
        row.mapsUrl ? [{ source: "Google Maps", placeUri: row.mapsUrl, title: row.title }] : []
      ),
      source: "grounding",
      metadata,
    };
  } catch (error) {
    // No invented positions, stale cached cafés, or privileged fallback.
    console.warn("[search-grounded-places] Nearby provider unavailable", error);
    return empty("nearby_provider_unavailable");
  }
}
