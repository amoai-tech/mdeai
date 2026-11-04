import { mapPinSchema, type MapPin } from "@/platform/contracts/map-pin";
import { formatEventStartsAt } from "@/lib/events/format-event";
import type { Rental } from "@/mastra/tools/search-rentals";

/** Returns the URL string only if it parses as a valid absolute URL, else undefined. */
function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : undefined;
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

/** The café and nightlife browse pages share source venue anchors and one map category.
 * Never synthesize a coordinate for a venue that has no saved location. */
type VenuePinSource = {
  id: string;
  name: string;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
  summary?: string | null;
};

export function venueToMapPin(r: VenuePinSource): MapPin | null {
  if (r.latitude == null || r.longitude == null) return null;
  const parsed = mapPinSchema.safeParse({
    id: `venue-${r.id}`,
    category: "venue",
    lat: r.latitude,
    lng: r.longitude,
    title: r.name,
    subtitle: r.neighborhood ?? undefined,
    placeUri: safeUrl(r.mapsUrl),
    source: "sql",
    meta: r.summary?.trim() ? { summary: r.summary.trim() } : undefined,
  });
  return parsed.success ? parsed.data : null;
}

/** Only what an event pin reads, so callers never fabricate a full catalog row. */
type EventPinSource = {
  id: string;
  slug: string;
  title: string;
  venue: string;
  neighborhood?: string | null;
  startsAt: string;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
};

/**
 * Canonical event pin from SAVED coordinates only. An event with no valid position keeps its card
 * and gets no marker: never a neighborhood guess, a default Medellín center or an invented location.
 */
export function eventToMapPin(e: EventPinSource): MapPin | null {
  if (e.latitude == null || e.longitude == null) return null;
  const parsed = mapPinSchema.safeParse({
    id: `event-${e.id}`,
    category: "event",
    lat: e.latitude,
    lng: e.longitude,
    title: e.title,
    subtitle: e.venue,
    placeUri: safeUrl(e.mapsUrl),
    source: "sql",
    meta: { summary: formatEventStartsAt(e.startsAt), detailsPath: `/events/${encodeURIComponent(e.slug)}` },
  });
  return parsed.success ? parsed.data : null;
}
