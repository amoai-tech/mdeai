import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import type { Database } from "@/lib/supabase/database.types";
import { isStoredRentalUuid } from "@/lib/cafe-search-fast-path";
import { DEFAULT_NEARBY_SEARCH_MASK, searchNearby } from "../lib/google-places-client";
import { RENTAL_SUPABASE_KEY } from "./search-rentals";

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

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

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
    const mapsUrl = typeof mapsUrlCandidate === "string" &&
      /^https:\/\/(?:www\.)?google\.[^/]+\/maps\b|^https:\/\/maps\.google\./i.test(mapsUrlCandidate)
      ? mapsUrlCandidate : undefined;
    results.push({
      id, title, latitude, longitude, placeId: id,
      ...(mapsUrl ? { mapsUrl } : {}),
      ...(typeof place.primaryType === "string" && place.primaryType
        ? { primaryType: place.primaryType } : {}),
    });
  }
  return results;
}

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

function getAnonymousRentalClient(): SupabaseClient<Database> | null {
  const env = getSupabaseServerAnonEnv();
  if (!env) return null;
  return createClient<Database>(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

  // A caller may see only its own RLS-authorized listings. An anonymous user
  // sees only the public policy's inventory. NEVER use service_role here.
  const client = readRlsRentalClient(context) ?? getAnonymousRentalClient();
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
