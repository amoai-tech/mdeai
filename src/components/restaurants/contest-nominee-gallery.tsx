"use client";

import { useMemo } from "react";
import { BrowseMapPanel } from "@/components/browse/BrowseMapPanel";
import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";
import { ContestNomineeCard } from "@/components/restaurants/contest-nominee-card";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { restaurantToMapPin } from "@/lib/browse/browse-pin-converters";
import type { PublicNominee } from "@/lib/restaurants/contest-public";
import { MapContextProvider, useMapContext } from "@/platform/maps/map-context";

/**
 * SAN-1524 · the ballot list and the existing browse map, side by side on a laptop.
 *
 * The map is reused, not rebuilt: the same `MapContextProvider` + `BrowseMapPanel`/`BrowseMapSheet`
 * that `/restaurants` uses, with pins built from catalog coordinates. Nominees without a real
 * coordinate pair are simply not pinned — they stay in the list — and if nobody has coordinates
 * the map is not rendered at all rather than shown empty.
 */
export function ContestNomineeGallery({
  contestId,
  nominees,
}: {
  contestId: string;
  nominees: PublicNominee[];
}) {
  return (
    <MapContextProvider seedMockPin={false}>
      <GalleryBody contestId={contestId} nominees={nominees} />
    </MapContextProvider>
  );
}

function GalleryBody({
  contestId,
  nominees,
}: {
  contestId: string;
  nominees: PublicNominee[];
}) {
  const { setSelectedPinId } = useMapContext();

  const pins = useMemo(
    () =>
      nominees.flatMap((nominee) => {
        const pin = restaurantToMapPin({
          id: nominee.restaurantId,
          name: nominee.name,
          neighborhood: nominee.neighborhood,
          latitude: nominee.latitude,
          longitude: nominee.longitude,
        });
        return pin ? [pin] : [];
      }),
    [nominees],
  );
  useBrowseMapSync(pins, "restaurant");

  const ballot = (
    <ul
      className="grid grid-cols-1 gap-5 sm:grid-cols-2"
      data-testid="contest-nominees"
    >
      {nominees.map((nominee) => (
        <ContestNomineeCard
          contestId={contestId}
          key={nominee.entityId}
          nominee={nominee}
          onActive={
            pins.length > 0
              ? () => setSelectedPinId("restaurant-" + nominee.restaurantId)
              : undefined
          }
        />
      ))}
    </ul>
  );

  if (pins.length === 0) return ballot;

  return (
    <div className="lg:flex lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">{ballot}</div>
      <aside
        aria-label="Map of participating restaurants"
        className="lg:w-[320px] lg:shrink-0 xl:w-[380px]"
        data-testid="contest-map"
      >
        <div className="mb-3 hidden lg:block">
          <h3 className="text-sm font-semibold">Map</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {pins.length} of {nominees.length} restaurants have a location.
          </p>
        </div>
        <BrowseMapPanel />
        <BrowseMapSheet />
      </aside>
    </div>
  );
}
