"use client";

import { useRentalUi } from "@/components/chat/rental-ui-context";
import { RentalDetailsSheet } from "@/components/rentals/rental-details-panel";
import { useIsLgUp } from "@/hooks/use-is-lg-up";

/**
 * SAN-1504 — phone and tablet bottom sheet for a chat rental result opened with Details.
 * Desktop shows the same details in the map column (`ChatMapPanel`), so this renders nothing at `lg`
 * and up. It reuses the sheet from `/rentals`; it adds no state of its own.
 */
export function RentalDetailMobileSheet() {
  const { venueDetail, closeVenueDetail, openScheduleViewing } = useRentalUi();
  const isLgUp = useIsLgUp();
  if (isLgUp || venueDetail?.kind !== "rental" || !venueDetail.rental) return null;
  return (
    <RentalDetailsSheet
      rental={venueDetail.rental}
      onClose={closeVenueDetail}
      onSchedule={() =>
        openScheduleViewing({
          listingId: venueDetail.listingId,
          title: venueDetail.title,
          neighborhood: venueDetail.neighborhood,
        })
      }
    />
  );
}
