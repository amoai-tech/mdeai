import { mapPinSchema, type MapPin } from "@/platform/contracts/map-pin";
import type { Rental } from "@/mastra/tools/search-rentals";

/** Returns the URL string only if it parses as a valid absolute URL, else undefined. */
function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    new URL(url);
    return url;
  } catch {
    return undefined;
  }
}

/**
 * Only the fields a restaurant pin actually reads. Contest nominees arrive from the contest read
 * rather than the search tool, so the converter accepts any catalog-shaped record instead of
 * forcing every caller to fabricate a full search result.
 */
type RestaurantPinSource = {
  id: string;
  name: string;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  mapsUrl?: string | null;
};

export function restaurantToMapPin(r: RestaurantPinSource): MapPin | null {
  if (r.latitude == null || r.longitude == null) return null;
  // Validate exactly like rentalToMapPin: a non-null pair can still be invalid
  // (lat 99, Infinity, NaN) and must not reach the shared map (SAN-1468 1.7).
  const validated = mapPinSchema.safeParse({
    id: `restaurant-${r.id}`,
    category: "restaurant",
    lat: r.latitude,
    lng: r.longitude,
    title: r.name,
    subtitle: r.neighborhood ?? undefined,
    placeId: r.placeId ?? undefined,
    placeUri: safeUrl(r.mapsUrl),
    source: "sql",
  });
  return validated.success ? validated.data : null;
}

/** Return a canonical rental pin only when its coordinates satisfy mapPinSchema. */
export function rentalToMapPin(r: Rental): MapPin | null {
  if (r.latitude == null || r.longitude == null) return null;
  // Validate exactly like tool/map pins: a non-null pair can still be invalid.
  // Verification of *ownership* of coordinates remains upstream of the public result.
  const validated = mapPinSchema.safeParse({
    id: `rental-${r.id}`,
    category: "rental",
    lat: r.latitude,
    lng: r.longitude,
    title: r.title,
    subtitle: r.neighborhood,
    source: "sql",
  });
  return validated.success ? validated.data : null;
}
