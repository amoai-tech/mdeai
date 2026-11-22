import type { GroundedPlaceSourceMode } from "@/lib/grounded-place-source";
import type { GroundedPlaceResult } from "../lib/map-adk-grounding-pins";
import type { VenueGroundingIntent } from "../lib/venue-grounding-intent";
import { searchRestaurants, type Restaurant } from "./search-restaurants";
import {
  isCoffeeVenueQuery,
  isNightlifeVenueQuery,
  searchCafeVenueAnchors,
  searchNightclubVenueAnchors,
  venueAnchorMapsUrl,
  venueAnchorSummary,
  venueAnchorToCoordinates,
  type RankedVenueAnchorRow,
} from "./search-venue-anchors";

/** Extract a neighborhood hint from a free-text grounding query. */
function neighborhoodFromGroundingQuery(query: string): string | undefined {
  const m = query.match(
    /\b(laureles|poblado|el\s+poblado|envigado|bel[eé]n|estadio|provenza|el\s+centro)\b/i,
  );
  return m?.[0];
}

/**
 * Map a curated Restaurant row to the GroundedPlaceResult shape expected by
 * parseGroundedToolResult / GroundedCafeResults. Used when ADK is unavailable.
 */
function restaurantToGroundedRow(r: Restaurant, sourceMode: GroundedPlaceSourceMode): GroundedPlaceResult {
  return {
    id: r.id,
    title: r.name,
    sourceMode,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    placeId: r.placeId ?? undefined,
    mapsUrl: (r.mapsUrl ?? undefined) as string | undefined,
    rating: r.rating != null && r.rating > 0 ? r.rating : undefined,
    summary: (r.aiSummary ?? r.vibe.slice(0, 3).join(" · ")) || undefined,
    formattedAddress: r.neighborhood,
    primaryType: r.cuisine === "cafe" ? "coffee_shop" : "restaurant",
  };
}

function anchorToGroundedRow(
  row: RankedVenueAnchorRow,
  primaryType: string,
): GroundedPlaceResult {
  const { latitude, longitude } = venueAnchorToCoordinates(row);
  const citation = row.evidence?.[0]?.extractedText;
  const baseSummary = venueAnchorSummary(row);
  const summary =
    citation && baseSummary
      ? `${baseSummary} — ${citation}`
      : citation ?? baseSummary;
  return {
    id: row.id,
    title: row.name,
    sourceMode: "saved_catalog",
    latitude: latitude ?? undefined,
    longitude: longitude ?? undefined,
    placeId: row.google_place_id,
    mapsUrl: venueAnchorMapsUrl(row.google_place_id),
    summary,
    formattedAddress: row.neighborhood ?? undefined,
    primaryType,
  } as GroundedPlaceResult;
}

const MEDELLIN_FALLBACK_BOUNDS = {
  minLat: 5.95,
  maxLat: 6.55,
  minLng: -75.75,
  maxLng: -75.25,
} as const;

/** The saved catalog is Medellín-only; do not use it for another city/viewport. */
export function shouldUseCuratedFallback(input: {
  hasNonMedellinCity: boolean;
  locationBias?: { latitude: number; longitude: number };
}): boolean {
  if (input.hasNonMedellinCity) return false;
  if (!input.locationBias) return true;
  return (
    input.locationBias.latitude >= MEDELLIN_FALLBACK_BOUNDS.minLat &&
    input.locationBias.latitude <= MEDELLIN_FALLBACK_BOUNDS.maxLat &&
    input.locationBias.longitude >= MEDELLIN_FALLBACK_BOUNDS.minLng &&
    input.locationBias.longitude <= MEDELLIN_FALLBACK_BOUNDS.maxLng
  );
}

export async function curatedFallback(
  rawQuery: string,
  pageSize: number,
  intent?: VenueGroundingIntent,
  allowed = true,
): Promise<GroundedPlaceResult[]> {
  if (!allowed) return [];
  const neighborhood = neighborhoodFromGroundingQuery(rawQuery);
  const isNightlife =
    intent === "nightlife" ||
    (intent !== "cafe" && isNightlifeVenueQuery(rawQuery));
  const isCoffee =
    intent === "cafe" ||
    (intent !== "nightlife" && isCoffeeVenueQuery(rawQuery));

  if (isNightlife) {
    const anchors = await searchNightclubVenueAnchors({
      neighborhood,
      limit: pageSize,
      queryText: rawQuery,
    });
    if (anchors.length > 0) {
      return anchors.map((row) => anchorToGroundedRow(row, "night_club"));
    }
    return [];
  }

  if (isCoffee) {
    const anchors = await searchCafeVenueAnchors({
      neighborhood,
      limit: pageSize,
      queryText: rawQuery,
    });
    if (anchors.length > 0) {
      return anchors.map((row) => anchorToGroundedRow(row, "coffee_shop"));
    }
  }

  const { results, source } = await searchRestaurants({
    neighborhood,
    cuisine: isCoffee ? ("cafe" as const) : undefined,
    limit: pageSize,
  });
  if (results.length > 0) return results.map((row) => restaurantToGroundedRow(
    row, source === "fallback" ? "demo_fixture" : "saved_catalog",
  ));
  if (isCoffee) {
    const { results: broader, source: broaderSource } = await searchRestaurants({
      neighborhood,
      limit: pageSize,
    });
    return broader.map((row) => restaurantToGroundedRow(
      row, broaderSource === "fallback" ? "demo_fixture" : "saved_catalog",
    ));
  }
  return [];
}
