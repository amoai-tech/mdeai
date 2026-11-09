/**
 * SAN-465: resolve a user-named route endpoint to a real Google Place ID.
 *
 * The model previously supplied plausible-looking but invented Place IDs
 * (e.g. "ChIJC5nPIzP024QRZo05wS3p8SI"), and Google Routes answered `404 Place ID
 * not found`. Address-only waypoints for bare neighborhood names also return an
 * empty route set. The existing server-only Places client resolves the exact
 * name within MDE's Medellín bias, so Routes receives an ID Google issued.
 *
 * One Text Search call per endpoint, bounded (maxAttempts: 1) and cached by the
 * route tool for the turn. This is not a second route engine: it only supplies
 * the waypoint the existing Routes client needs.
 */
import { searchText } from "./google-places-client";

/** The MDE Medellín anchor used by Maps grounding and discovery. */
const MEDELLIN_CENTER = { latitude: 6.2442, longitude: -75.5812 } as const;
const LOCATION_BIAS = {
  circle: { center: MEDELLIN_CENTER, radius: 20_000 },
} as const;

/** Smallest mask that returns an ID; avoids Enterprise/Atmosphere fields. */
const ROUTE_PLACE_FIELD_MASK = ["places.id"] as const;

/**
 * ponytail: accept the first Places result inside the Medellín bias; Google's
 * relevance ranking resolves the common names (Parque Lleras, Provenza,
 * Laureles, Envigado, the airport). A truly ambiguous label can still route to
 * a plausible-but-wrong match. Upgrade path: request displayName +
 * formattedAddress, reject candidates with no token overlap, and ask the user
 * to choose in the existing map/list surface (SAN-229). That needs a new choice
 * UI, so it is not invented here.
 */

function placeIdFromResponse(response: unknown): string | null {
  const places = (response as { places?: unknown } | null)?.places;
  if (!Array.isArray(places) || places.length === 0) return null;
  const id = (places[0] as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

/**
 * Resolve one label to a Google Place ID, or null when Places finds no match
 * (or the provider fails). A null result means the caller must report the route
 * unavailable rather than guess an endpoint.
 */
export async function resolveRoutePlaceId(query: string): Promise<string | null> {
  const textQuery = query.trim();
  if (!textQuery) return null;
  try {
    const response = await searchText({
      textQuery,
      pageSize: 1,
      languageCode: "es",
      regionCode: "CO",
      locationBias: LOCATION_BIAS,
      fieldMask: ROUTE_PLACE_FIELD_MASK,
      maxAttempts: 1,
    });
    return placeIdFromResponse(response);
  } catch (err) {
    console.warn(
      "[route-resolution] Places lookup failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
