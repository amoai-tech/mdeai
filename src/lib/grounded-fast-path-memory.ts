import { geoDistanceMeters } from "@/lib/geo-distance";
import {
  resolveGroundedTitle,
  type GroundedAttributionRow,
  type GroundedToolRow,
} from "@/lib/parse-grounded-tool-result";
type NearbyMetadata = { searchMode?: string; anchorPinId?: string };
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
  const anchorId = metadata?.searchMode === "nearby" && anchorPin
    ? anchorPin.id.replace(/^rental-/, "")
    : undefined;
  const lastGroundedResults = results.slice(0, 5).map((row, index) => {
    const measured = anchorPin && row.latitude != null && row.longitude != null
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
      ...measured,
    };
  });
  return {
    lastIntent: "restaurant_discovery" as const,
    lastGroundedResults,
    ...(anchorId ? { selectedListingId: anchorId } : {}),
  };
}
