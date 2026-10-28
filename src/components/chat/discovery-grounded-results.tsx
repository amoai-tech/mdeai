"use client";

import { useMemo } from "react";
import { GroundedPlaceCard } from "@/components/copilot/grounded-place-card";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { mapPinSchema, type MapPin } from "@/platform/contracts/map-pin";
import { useMapContext } from "@/platform/maps/map-context";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";

/** The existing grounded-place card and canonical Maps pin converter share a stable ID. */
export function groundedDiscoveryPins(rows: GroundedToolRow[]) {
  return rows.flatMap((r) => {
    if (r.latitude == null || r.longitude == null) return [];
    const pin = mapPinSchema.safeParse({
      id: `grounded-${r.id}`,
      category: "grounded",
      lat: r.latitude,
      lng: r.longitude,
      title: r.title,
      subtitle: r.formattedAddress,
      placeId: r.placeId,
      placeUri: r.mapsUrl,
      source: r.groundingSource ? "grounding" : "places",
    });
    return pin.success ? [pin.data] : [];
  });
}

/** Match map visibility to pins that will actually be synced, even before effects run. */
export function hasVenueBrowseMapPins(
  basePins: MapPin[],
  rows: GroundedToolRow[] | null,
  error: string | null,
): boolean {
  if (error) return false;
  return rows === null ? basePins.length > 0 : groundedDiscoveryPins(rows).length > 0;
}

export function DiscoveryGroundedResults({ rows, selectedId, onSelectRow }: {
  rows: GroundedToolRow[] | null;
  selectedId?: string | null;
  onSelectRow?: (id: string | null) => void;
}) {
  const pins = useMemo(() => groundedDiscoveryPins(rows ?? []), [rows]);
  const { selectedPinId, panToPin } = useMapContext();
  useBrowseMapSync(pins, "grounded");
  if (rows === null) return null;
  return (
    <section aria-label="Ask MDE places" data-testid="discovery-grounded-results" className="mt-3">
      <p className="mb-3 text-sm text-muted-foreground">
        Ask MDE — {rows.length} places. Map pins appear only for returned coordinates.
      </p>
      {rows.length === 0 ? <p>No matching places were returned. Try another area.</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const pinId = `grounded-${r.id}`;
            const mapped = pins.some((p) => p.id === pinId);
            return (
              <div key={r.id}>
              <GroundedPlaceCard
                testId="discovery-grounded-card"
                title={r.title}
                mapsUrl={r.mapsUrl}
                directionsUrl={r.directionsUrl}
                reviewsUrl={r.reviewsUrl}
                rating={r.rating}
                userRatingCount={r.userRatingCount}
                priceLevel={r.priceLevel}
                openNow={r.openNow}
                primaryType={r.primaryType}
                summary={r.summary}
                formattedAddress={r.formattedAddress}
                photoName={r.photoName}
                photoAuthorAttributions={r.photoAuthorAttributions}
                pinId={mapped ? pinId : undefined}
                selected={selectedId === r.id || (mapped && selectedPinId === pinId)}
                onSelect={mapped ? () => { panToPin(pinId); onSelectRow?.(r.id); } : undefined}
              />
              {onSelectRow ? <button type="button" data-testid="grounded-ask-select"
                aria-pressed={selectedId === r.id} className="mt-1 rounded border px-3 py-2 text-xs"
                onClick={() => onSelectRow(selectedId === r.id ? null : r.id)}>
                {selectedId === r.id ? "Clear selection" : "Ask about this"}
              </button> : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
