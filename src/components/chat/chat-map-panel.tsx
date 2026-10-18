"use client";

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { ChatMap } from "@/components/maps/ChatMap";
import { CafeDetailPanel } from "@/components/cafe/cafe-detail-panel";
import { NightlifeDetailPanel } from "@/components/nightlife/nightlife-detail-panel";
import { useRentalUi } from "@/components/chat/rental-ui-context";
import { EmptyState } from "@/components/empty/empty-state";
import { RentalDetailsPanel } from "@/components/rentals/rental-details-panel";
import { useIsLgUp } from "@/hooks/use-is-lg-up";
import { useMapContext } from "@/platform/maps/map-context";

/** MAP-007 sticky map column (desktop). */
export function ChatMapPanel() {
  const { pins } = useMapContext();
  const {
    cafeDetail,
    cafeSiblings,
    nightlifeDetail,
    nightlifeSiblings,
    venueDetail,
    closeVenueDetail,
    openScheduleViewing,
  } = useRentalUi();
  const isLgUp = useIsLgUp();
  const visiblePins = pins.filter((pin) => pin.source !== "mock");
  const showEmpty = visiblePins.length === 0;

  // SAN-1504: a chat rental result opened with Details. The panel is drawn OVER the map, which stays
  // mounted, so closing it brings back the same camera, pins and selected pin.
  const rentalDetail = venueDetail?.kind === "rental" && venueDetail.rental ? venueDetail : null;
  const rentalPanel = isLgUp ? rentalDetail : null;

  // If a new search removes the open apartment's pin, the apartment is no longer in the results:
  // drop its details. Only after the pin was seen once, so a card whose pin was never pushed (for
  // example a re-hydrated old result) does not close its own details the moment it opens.
  const seenPinRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rentalDetail?.pinned) {
      seenPinRef.current = null;
      return;
    }
    if (pins.some((pin) => pin.id === rentalDetail.pinId)) {
      seenPinRef.current = rentalDetail.pinId;
    } else if (seenPinRef.current === rentalDetail.pinId) {
      closeVenueDetail();
    }
  }, [rentalDetail, pins, closeVenueDetail]);

  if (nightlifeDetail) {
    return (
      <section
        data-testid="map-panel"
        data-right-column-mode="detail"
        aria-label="Nightlife detail"
        className="relative hidden h-full min-h-0 w-full min-w-0 lg:flex lg:flex-col"
      >
        <NightlifeDetailPanel
          detail={nightlifeDetail}
          siblings={nightlifeSiblings}
          className="h-full"
        />
      </section>
    );
  }

  if (cafeDetail) {
    return (
      <section
        data-testid="map-panel"
        data-right-column-mode="detail"
        aria-label="Café detail"
        className="relative hidden h-full min-h-0 w-full min-w-0 lg:flex lg:flex-col"
      >
        <CafeDetailPanel
          detail={cafeDetail}
          siblings={cafeSiblings}
          className="h-full"
        />
      </section>
    );
  }

  return (
    <section
      data-testid="map-panel"
      data-right-column-mode={rentalPanel ? "detail" : "map"}
      aria-label={rentalPanel ? "Rental details" : "Medellín map"}
      className="relative hidden h-full min-h-0 w-full min-w-0 lg:flex lg:flex-col"
    >
      <div className="relative min-h-0 flex-1 lg:sticky lg:top-0 lg:h-full">
        {/* inert: while the panel covers the map, its controls must not take keyboard focus.
            relative z-0: the map's own overlays (z-20 inside it) stay below the panel (z-10 outside). */}
        <div className="relative z-0 size-full" inert={rentalPanel ? true : undefined}>
          <ChatMap mapDomId="chat-map" />
        </div>
        {rentalPanel?.rental ? (
          <RentalDetailsPanel
            rental={rentalPanel.rental}
            onClose={closeVenueDetail}
            onSchedule={() =>
              openScheduleViewing({
                listingId: rentalPanel.listingId,
                title: rentalPanel.title,
                neighborhood: rentalPanel.neighborhood,
              })
            }
          />
        ) : null}
        {showEmpty && !rentalPanel ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
            data-testid="map-empty-state"
          >
            <EmptyState
              testId="map-empty-state-card"
              title="Map is ready"
              description="Search in chat to see available map locations."
              icon={<MapPin className="size-8" />}
              className="pointer-events-auto max-w-xs bg-background/95"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
