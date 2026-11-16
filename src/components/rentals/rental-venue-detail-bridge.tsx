"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRentalUi } from "@/components/chat/rental-ui-context";
import type { Rental } from "@/mastra/tools/search-rentals";

/**
 * F8 — an AI-shown apartment card asks `RentalUiProvider` to open Details. On the
 * Rentals page nothing rendered that request (the page keeps its own Details
 * selection), so "Details" on the panel card did nothing. This hands the request
 * to the page's existing selection, which is the same path a native card uses
 * (panel, pin and `selectedListingId` for the next question).
 *
 * A request for an apartment that this page is not showing goes to the canonical
 * public details page instead of failing silently.
 */
export function RentalVenueDetailBridge({
  results,
  openDetailsFor,
}: {
  results: readonly Rental[];
  openDetailsFor: (rental: Rental) => void;
}) {
  const { venueDetail, closeVenueDetail } = useRentalUi();
  const router = useRouter();
  useEffect(() => {
    if (venueDetail?.kind !== "rental") return;
    const rental = results.find((candidate) => candidate.id === venueDetail.listingId);
    closeVenueDetail();
    if (rental) openDetailsFor(rental);
    else router.push(`/rentals/${encodeURIComponent(venueDetail.listingId)}`);
  }, [venueDetail, results, openDetailsFor, closeVenueDetail, router]);
  return null;
}
