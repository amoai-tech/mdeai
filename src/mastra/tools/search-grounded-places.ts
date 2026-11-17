import { isMapAreaQuery } from "@/lib/map-area-query";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { enrichedGroundedPlaceFieldsSchema } from "../lib/adk-grounding-types";
import { invokeAdkGrounding, isAdkGroundingConfigured } from "../lib/adk-grounding-client";
import {
  hasExplicitPlaceScope,
  hasNonMedellinCity,
  hasOutsideMedellinPlaceScope,
  MEDELLIN_BIAS,
  searchGoogleCafes,
} from "../lib/google-places-cafe-search";
import { groundedPlaceSourceModes } from "@/lib/grounded-place-source";
import { mapAdkGroundingPins } from "../lib/map-adk-grounding-pins";
import { incrementAndCheckGroundingQuota } from "../lib/grounding-quota";
import {
  resolveGroundingLocationBias,
  resolveGroundingMemory,
} from "../lib/grounding-location-bias";
import { runAuditedTool } from "../lib/run-audited-search";
import { filterCafeGroundingRows, filterNightlifeGroundingRows } from "../lib/venue-grounding-filter";
export { filterCafeGroundingRows, filterNightlifeGroundingRows, normalizeCafeGroundingQuery } from "../lib/venue-grounding-filter";
import { hasVerifiedNearbyRentalUser, searchNearbyRentalPlaces } from "./nearby-rental-places";
import { curatedFallback, shouldUseCuratedFallback } from "./grounded-places-curated-fallback";
import {
  normalizeVenueGroundingQuery,
  isCafeGroundingIntent,
  venueGroundingIntentSchema,
  resolveVenueGroundingKind,
  type VenueGroundingIntent,
} from "../lib/venue-grounding-intent";
export {
  isCafeGroundingQuery,
  isNightlifeGroundingQuery,
  normalizeVenueGroundingQuery,
  isCafeGroundingIntent,
  isNightlifeGroundingIntent,
  venueGroundingIntentSchema,
  resolveVenueGroundingKind,
} from "../lib/venue-grounding-intent";
export { shouldUseCuratedFallback } from "./grounded-places-curated-fallback";
export type { VenueGroundingIntent, VenueGroundingKind } from "../lib/venue-grounding-intent";

const groundedPlaceResultSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    placeId: z.string().optional(),
    sourceMode: z.enum(groundedPlaceSourceModes).optional(),
    mapsUrl: z.string().url().optional(),
    directionsUrl: z.string().url().optional(),
    reviewsUrl: z.string().url().optional(),
  })
  .merge(enrichedGroundedPlaceFieldsSchema);

type GroundedAttributionSource = {
  source: string;
  placeUri: string;
  title?: string;
};

/**
 * Fallback when ADK grounding is unavailable — café queries use venue_anchors
 * (DATA-035); other queries use curated restaurants.
 */
function withVenueKindMetadata<T extends Record<string, unknown>>(
  payload: T,
  rawQuery: string,
  intent?: VenueGroundingIntent,
): T & { metadata: Record<string, unknown> } {
  const venueKind = resolveVenueGroundingKind(rawQuery, intent);
  const existing =
    payload.metadata && typeof payload.metadata === "object"
      ? (payload.metadata as Record<string, unknown>)
      : {};
  return {
    ...payload,
    metadata: { ...existing, venueKind },
  };
}

/**
 * Join ADK attribution to filtered rows by mapsUrl — never index-zip (audit B1). Google's source is
 * passed through unchanged: its name and URL are Google's, so the card never rewrites them (SAN-878).
 */
export function alignGroundedAttribution(
  results: Array<{ title: string; mapsUrl?: string }>,
  adkAttribution: GroundedAttributionSource[],
): GroundedAttributionSource[] {
  return results.flatMap((row) => {
    const source = adkAttribution.find((a) => a.placeUri === row.mapsUrl);
    return source ? [source] : [];
  });
}

export const searchGroundedPlacesInputSchema = z.object({
  query: z.string().min(1).describe("Natural language place search"),
  intent: venueGroundingIntentSchema
    .optional()
    .describe(
      "Optional venue kind: cafe, nightlife (clubs/bars), or general POI search",
    ),
  pageSize: z.number().int().min(1).max(10).default(5).optional(),
  nearbyRentalId: z.string().uuid().optional().describe("Selected rental UUID from the current authorized search. Server resolves real coordinates; never invent an ID."),
  nearbyRadiusMeters: z.number().int().min(100).max(5000).optional().describe("Nearby radius in metres, default 800; only with a selected rental."),
  locationBias: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional()
    .describe(
      "Optional map center — pass mapUi.viewport { lat→latitude, lng→longitude } when search should follow the visible map",
    ),
});

export const searchGroundedPlacesTool = createTool({
  id: "search-grounded-places",
  description:
    "Search places near Medellín using existing Google grounding or clearly source-labeled saved catalog fallback. Each row has a sourceMode; saved listings are NOT live Google verification. Never invent coordinates, ratings, Wi-Fi quality, or opening hours.",
  inputSchema: searchGroundedPlacesInputSchema,
  outputSchema: z.object({
    results: z.array(groundedPlaceResultSchema),
    attribution: z.array(
      z.object({
        source: z.string(),
        placeUri: z.string().url(),
        title: z.string().optional(),
      }),
    ),
    source: z.literal("grounding"),
    metadata: z.record(z.unknown()).optional(),
  }),
  execute: async (
    inputData: {
      query: string;
      intent?: VenueGroundingIntent;
      pageSize?: number;
      nearbyRentalId?: string;
      nearbyRadiusMeters?: number;
      locationBias?: { latitude: number; longitude: number };
    },
    context?: unknown,
  ) =>
    runAuditedTool(
      "search-grounded-places",
      async () => {
    const { query: rawQuery, intent, pageSize, locationBias: inputBias } =
      inputData;
    // Nearby discovery is one mode of the existing grounded tool, not a second
    // provider or client-owned coordinates. The server checks the rental via RLS.
    if (inputData.nearbyRentalId) {
      if (!isCafeGroundingIntent(rawQuery, intent)) {
        return {
          results: [], attribution: [], source: "grounding" as const,
          metadata: { reason: "nearby_supported_for_cafes_only", venueKind: "general" },
        };
      }
      // Agent calls bypass the HTTP fast-path route: require a verified,
      // non-anonymous Supabase user before even reserving paid Places quota.
      // Service bearer alone and public anonymous clients never authorize Nearby.
      if (!(await hasVerifiedNearbyRentalUser(context))) {
        return {
          results: [], attribution: [], source: "grounding" as const,
          metadata: {
            venueKind: "cafe" as const,
            searchMode: "nearby" as const,
            anchorPinId: `rental-${inputData.nearbyRentalId}`,
            reason: "authentication_required",
          },
        };
      }
      // Nearby is billed too: enforce the existing daily Places/grounding
      // budget and kill switch before a single Google request (Autosana).
      const nearbyQuota = await incrementAndCheckGroundingQuota();
      if (!nearbyQuota.allowed) {
        return {
          results: [], attribution: [], source: "grounding" as const,
          metadata: {
            venueKind: "cafe" as const,
            searchMode: "nearby" as const,
            anchorPinId: `rental-${inputData.nearbyRentalId}`,
            reason: nearbyQuota.reason,
          },
        };
      }
      return searchNearbyRentalPlaces({
        rentalId: inputData.nearbyRentalId,
        radiusMeters: inputData.nearbyRadiusMeters ?? 800,
        limit: pageSize ?? 5,
      }, context);
    }
    const hasExplicitPlace = hasExplicitPlaceScope(rawQuery);
    const hasNonMedellinCityMatch = hasNonMedellinCity(rawQuery);
    // An unknown named place may be a valid Medellín barrio or landmark.
    // Only positively identified outside destinations can suppress Places:
    // otherwise 'Manila' and 'Parque Lleras' wrongly return no results.
    const hasUncoveredDestination = hasOutsideMedellinPlaceScope(rawQuery);
    if (hasUncoveredDestination && isCafeGroundingIntent(rawQuery, intent)) {
      return withVenueKindMetadata(
        { results: [], attribution: [], source: "grounding" as const,
          metadata: { reason: "outside_catalog_coverage" } },
        rawQuery,
        intent,
      );
    }
    const memoryContext = hasExplicitPlace
      ? {}
      : await resolveGroundingMemory(context);
    const resolvedLocationBias = await resolveGroundingLocationBias(
      { locationBias: inputBias },
      memoryContext,
    );
    // A real viewport outside the supported Medellín area is not permission
    // to return unrelated Medellín cafés. Preserve the user's map position.
    if (
      isCafeGroundingIntent(rawQuery, intent) &&
      resolvedLocationBias &&
      !shouldUseCuratedFallback({
        hasNonMedellinCity: false,
        locationBias: resolvedLocationBias,
      })
    ) {
      return withVenueKindMetadata(
        { results: [], attribution: [], source: "grounding" as const,
          metadata: { reason: "outside_catalog_coverage" } },
        rawQuery,
        intent,
      );
    }
    const mapRelativeSearch = isMapAreaQuery(rawQuery) && !hasExplicitPlace;
    // A map-relative question without a real camera must never be silently
    // geolocated to the default city or charged to Google Places.
    if (mapRelativeSearch && !resolvedLocationBias) {
      return withVenueKindMetadata(
        { results: [], attribution: [], source: "grounding" as const,
          metadata: { reason: "missing_map_context" } },
        rawQuery,
        intent,
      );
    }
    const effectiveLocationBias =
      resolvedLocationBias ??
      (hasNonMedellinCityMatch ? undefined : MEDELLIN_BIAS);
    // A citywide saved catalog is not evidence that a cafe is near a moved
    // map. Do not substitute unfiltered saved results for viewport queries.
    const curatedAllowed = !mapRelativeSearch && shouldUseCuratedFallback({
      hasNonMedellinCity: hasNonMedellinCityMatch,
      locationBias: effectiveLocationBias,
    });
    const query = normalizeVenueGroundingQuery(rawQuery, {
      hasViewportBias: Boolean(resolvedLocationBias),
    });
    // No configured ADK endpoint => no paid provider call and no quota unit.
    if (!isCafeGroundingIntent(rawQuery, intent) && !isAdkGroundingConfigured()) {
      if (!curatedAllowed) {
        return withVenueKindMetadata(
          {
            results: [],
            attribution: [],
            source: "grounding" as const,
            metadata: { fallback: "curated", reason: "outside_catalog_coverage" },
          },
          rawQuery,
          intent,
        );
      }
      try {
        const fallbackResults = await curatedFallback(rawQuery, pageSize ?? 5, intent, true);
        return withVenueKindMetadata(
          {
            results: fallbackResults,
            attribution: [],
            source: "grounding" as const,
            metadata: { fallback: "curated", reason: "adk_not_configured" },
          },
          rawQuery,
          intent,
        );
      } catch (err) {
        console.warn("[search-grounded-places] catalog fallback failed:", err);
        return withVenueKindMetadata(
          {
            results: [],
            attribution: [],
            source: "grounding" as const,
            metadata: { fallback: "curated", reason: "adk_not_configured" },
          },
          rawQuery,
          intent,
        );
      }
    }
    const quota = await incrementAndCheckGroundingQuota();
    if (!quota.allowed) {
      // Quota exceeded — degrade to curated restaurant results only in coverage.
      if (!curatedAllowed) {
        return withVenueKindMetadata(
          {
            results: [],
            attribution: [],
            source: "grounding" as const,
            metadata: { reason: quota.reason, fallback: "curated", outsideCatalogCoverage: true },
          },
          rawQuery,
          intent,
        );
      }
      try {
        const fallbackResults = await curatedFallback(
          rawQuery,
          pageSize ?? 5,
          intent,
          true,
        );
        if (fallbackResults.length > 0) {
          return withVenueKindMetadata(
            {
              results: fallbackResults,
              attribution: [],
              source: "grounding" as const,
              metadata: { reason: quota.reason, fallback: "curated" },
            },
            rawQuery,
            intent,
          );
        }
      } catch (err) {
        console.warn("[search-grounded-places] quota fallback failed:", err);
      }
      return withVenueKindMetadata(
        {
          results: [],
          attribution: [],
          source: "grounding" as const,
          metadata: { reason: quota.reason },
        },
        rawQuery,
        intent,
      );
    }
    // Real Google cafés first: the installed Places SDK supplies stable IDs,
    // coordinates and links without depending on the absent ADK sidecar.
    let directCafeAttempted = false;
    let directCafeError = false;
    if (isCafeGroundingIntent(rawQuery, intent)) {
      directCafeAttempted = true;
      try {
        const direct = await searchGoogleCafes({
          query: rawQuery,
          pageSize: pageSize ?? 5,
          locationBias: effectiveLocationBias,
        });
        const filteredDirect = filterCafeGroundingRows(direct.results, rawQuery, intent);
        if (filteredDirect.length > 0) {
          return withVenueKindMetadata(
            {
              results: filteredDirect,
              attribution: alignGroundedAttribution(filteredDirect, direct.attribution),
              source: "grounding" as const,
              metadata: { provider: "google_places", searchMode: "text" },
            },
            rawQuery,
            intent,
          );
        }
      } catch (err) {
        directCafeError = true;
        console.warn("[search-grounded-places] Google Places café search failed:", err);
      }
    }
    // Google is the single café provider. If it fails or returns nothing, use
    // the saved catalog immediately; do not run a second billable search.
    if (directCafeAttempted) {
      if (!curatedAllowed) {
        return withVenueKindMetadata(
          {
            results: [],
            attribution: [],
            source: "grounding" as const,
            metadata: {
              provider: "google_places",
              ...(mapRelativeSearch ? {} : { fallback: "curated" }),
              reason: mapRelativeSearch
                ? (directCafeError ? "google_places_unavailable" : "google_places_empty")
                : "outside_catalog_coverage",
            },
          },
          rawQuery,
          intent,
        );
      }
      try {
        const fallbackResults = await curatedFallback(rawQuery, pageSize ?? 5, intent, true);
        return withVenueKindMetadata(
          {
            results: fallbackResults,
            attribution: [],
            source: "grounding" as const,
            metadata: {
              provider: "google_places",
              fallback: "curated",
              reason: directCafeError ? "google_places_unavailable" : "google_places_empty",
            },
          },
          rawQuery,
          intent,
        );
      } catch (err) {
        console.warn("[search-grounded-places] café fallback failed:", err);
        return withVenueKindMetadata(
          {
            results: [],
            attribution: [],
            source: "grounding" as const,
            metadata: {
              provider: "google_places",
              reason: directCafeError ? "google_places_unavailable" : "google_places_empty",
            },
          },
          rawQuery,
          intent,
        );
      }
    }
    const adk = await invokeAdkGrounding({
      query,
      pageSize,
      locationBias: effectiveLocationBias,
    });
    const reason = adk.metadata?.reason;
    if (reason && adk.pins.length === 0) {
      // ADK unavailable (permission / network) — degrade only inside catalog coverage.
      if (!curatedAllowed) {
        return withVenueKindMetadata(
          {
            results: [],
            attribution: [],
            source: "grounding" as const,
            metadata: { ...adk.metadata, fallback: "curated", outsideCatalogCoverage: true },
          },
          rawQuery,
          intent,
        );
      }
      try {
        const fallbackResults = await curatedFallback(
          rawQuery,
          pageSize ?? 5,
          intent,
          true,
        );
        if (fallbackResults.length > 0) {
          return withVenueKindMetadata(
            {
              results: fallbackResults,
              attribution: [],
              source: "grounding" as const,
              metadata: { ...adk.metadata, fallback: "curated" },
            },
            rawQuery,
            intent,
          );
        }
      } catch (err) {
        console.warn("[search-grounded-places] adk fallback failed:", err);
      }
      return withVenueKindMetadata(
        {
          results: [],
          attribution: [],
          source: "grounding" as const,
          metadata: adk.metadata,
        },
        rawQuery,
        intent,
      );
    }
    const mapped = mapAdkGroundingPins(adk);
    const cafeFiltered = filterCafeGroundingRows(mapped, rawQuery, intent);
    const filtered = filterNightlifeGroundingRows(cafeFiltered, rawQuery, intent);
    const results = filtered.map((row) => ({
      ...row,
      mapsUrl: row.mapsUrl as string | undefined,
    }));
    const attribution = alignGroundedAttribution(results, adk.attribution);
    return withVenueKindMetadata(
      {
        results,
        attribution,
        source: "grounding" as const,
        metadata: adk.metadata,
      },
      rawQuery,
      intent,
    );
      },
      context,
    ),
});
