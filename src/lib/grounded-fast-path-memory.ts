import { geoDistanceMeters } from "@/lib/geo-distance";
import {
  resolveGroundedTitle,
  type GroundedAttributionRow,
  type GroundedToolRow,
} from "@/lib/parse-grounded-tool-result";
type NearbyMetadata = { searchMode?: string; anchorPinId?: string };

function validCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
type AnchorPin = {
  id: string;
  category: string;
  lat: number;
  lng: number;
};

/**
 * Working-memory patch for one grounded fast-path result. Kept pure so a test
 * can prove the two gate fields agree: every distanceFromRentalId must equal
 * the selectedListingId the prompt compares against.
 */
export function groundedFastPathMemory({
  metadata,
  results,
  anchorPin,
  attribution,
}: {
  metadata: NearbyMetadata | undefined;
  results: GroundedToolRow[];
  anchorPin: AnchorPin | undefined;
  attribution: GroundedAttributionRow[];
}) {
  // Never attribute a distance to a different or malformed rental anchor.
  const anchorId = metadata?.searchMode === "nearby" &&
    metadata.anchorPinId?.startsWith("rental-") &&
    anchorPin?.category === "rental" &&
    anchorPin.id === metadata.anchorPinId &&
    validCoordinates(anchorPin.lat, anchorPin.lng)
    ? anchorPin.id.slice("rental-".length)
    : undefined;
  const lastGroundedResults = results.slice(0, 5).map((row, index) => {
    const measured = anchorId && anchorPin &&
      row.latitude != null && row.longitude != null &&
      validCoordinates(row.latitude, row.longitude)
      ? {
          distanceMeters: geoDistanceMeters(
            { lat: anchorPin.lat, lng: anchorPin.lng },
            { lat: row.latitude, lng: row.longitude },
          ),
          distanceFromRentalId: anchorId,
        }
      : {};
    return {
      id: row.id,
      title: resolveGroundedTitle(row, index, attribution, row.mapsUrl),
      ...(row.formattedAddress ? { area: row.formattedAddress.slice(0, 140) } : {}),
      ...(row.summary ? { summary: row.summary.slice(0, 240) } : {}),
      ...(row.rating != null ? { rating: row.rating } : {}),
      ...(typeof row.wifi === "boolean" ? { wifi: row.wifi } : {}),
      ...(typeof row.hasWifi === "boolean" ? { hasWifi: row.hasWifi } : {}),
      ...(typeof row.powerOutlets === "boolean" ? { powerOutlets: row.powerOutlets } : {}),
      ...(typeof row.hasPowerOutlets === "boolean" ? { hasPowerOutlets: row.hasPowerOutlets } : {}),
      ...(typeof row.seating === "boolean" ? { seating: row.seating } :
        typeof row.seating === "string" && row.seating.trim()
          ? { seating: row.seating.slice(0, 140) } : {}),
      ...(typeof row.outdoorSeating === "boolean" ? { outdoorSeating: row.outdoorSeating } : {}),
      ...measured,
    };
  });
  return {
    lastIntent: "restaurant_discovery" as const,
    lastGroundedResults,
    ...(anchorId ? { selectedListingId: anchorId } : {}),
  };
}
