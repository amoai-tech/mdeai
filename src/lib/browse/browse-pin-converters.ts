import { mapPinSchema, type MapPin } from "@/platform/contracts/map-pin";
import type { Restaurant } from "@/mastra/tools/search-restaurants";
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

export function restaurantToMapPin(r: Restaurant): MapPin | null {
  if (r.latitude == null || r.longitude == null) return null;
  return {
    id: `restaurant-${r.id}`,
    category: "restaurant",
    lat: r.latitude,
    lng: r.longitude,
    title: r.name,
    subtitle: r.neighborhood,
    placeId: r.placeId ?? undefined,
    placeUri: safeUrl(r.mapsUrl),
    source: "sql",
  };
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
