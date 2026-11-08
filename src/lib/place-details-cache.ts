import {
  getPlaceDetails,
  normalizePlaceId,
  PlacesRequestError,
} from "@/mastra/lib/google-places-client";
import {
  getPlacesNegativeCacheUntil,
  recordPlacesNegativeCache,
} from "@/lib/place-details-negative-cache";

export type PlaceDetailsFetchResult = {
  raw: unknown;
};

/**
 * Fetch Place Details without persisting the provider response.
 *
 * Google's Places policy exempts only Place IDs from caching restrictions and
 * prohibits caching photo resource names. `place_details_cache` previously
 * stored the raw response (including `photos`) for seven days; this path is
 * intentionally databaseless so no new prohibited content is retained.
 * Existing rows are handled by the SAN-105 cleanup, not by this code.
 */
export async function fetchPlaceDetailsWithCache(
  placeId: string,
): Promise<PlaceDetailsFetchResult> {
  const id = normalizePlaceId(placeId);
  if (getPlacesNegativeCacheUntil(id)) {
    throw new PlacesRequestError(
      "Places detail temporarily unavailable (negative cache)",
    );
  }

  try {
    const raw = await getPlaceDetails({ placeId: id });
    return { raw };
  } catch (err) {
    if (err instanceof PlacesRequestError) {
      recordPlacesNegativeCache(id);
    }
    throw err;
  }
}
