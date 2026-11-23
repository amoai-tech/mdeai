"use client";

import { useLayoutEffect, useRef } from "react";
import { useGenerativeUIFunction } from "@copilotkit/react-core/v2/generative-ui";
import { canOpenNativeViewingReview, mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import type { Rental } from "@/mastra/tools/search-rentals";

/**
 * One page-owned action bridge for the official CopilotKit Buttons in rental
 * comparison tables. Button args carry only a listing ID; the currently shown
 * authorized results supply the real listing and the existing page actions.
 */
export function currentComparedRental(rows: readonly Rental[], listingId: string): Rental | null {
  return rows.find((row) => row.id === listingId) ?? null;
}

export function RentalComparisonPageActions({
  results,
  onOpenDetails,
  onScheduleViewing,
  onStatusChange,
}: {
  results: readonly Rental[];
  onOpenDetails: (rental: Rental) => void;
  onScheduleViewing: (rental: Rental) => void;
  onStatusChange: (message: string | null) => void;
}) {
  const latest = useRef({ results, onOpenDetails, onScheduleViewing, onStatusChange });
  const showError = (message: string) => {
    latest.current.onStatusChange(message);
    return { ok: false, error: message };
  };
  useLayoutEffect(() => {
    latest.current = { results, onOpenDetails, onScheduleViewing, onStatusChange };
  }, [results, onOpenDetails, onScheduleViewing, onStatusChange]);

  // CopilotKit's useGenerativeUIFunction registers once per mount and reads
  // its latest callback ref after rerenders; memoizing these callbacks is unnecessary.

  useGenerativeUIFunction(mdeUI, "openComparedRentalDetails", ({ listingId }) => {
    const row = currentComparedRental(latest.current.results, listingId);
    if (!row) return showError("This apartment is no longer in the current results.");
    latest.current.onStatusChange(null);
    latest.current.onOpenDetails(row);
    return { ok: true, status: "details_opened" };
  });

  useGenerativeUIFunction(mdeUI, "requestComparedRentalViewing", ({ listingId }) => {
    const row = currentComparedRental(latest.current.results, listingId);
    if (!row) return showError("This apartment is no longer in the current results.");
    // This is a technical persistence check, not a business/approval gate:
    // source-only previews have no saved apartment target for a viewing write.
    if (!canOpenNativeViewingReview(row, true)) {
      return showError("This preview has no saved apartment record for a viewing request. Open Details to see its source.");
    }
    latest.current.onStatusChange(null);
    // Opening the existing review modal is not the same as booking a viewing.
    latest.current.onScheduleViewing(row);
    return { ok: true, status: "viewing_review_opened" };
  });

  // Functions are registered here, but feedback belongs beside the Table
  // inside DiscoveryWorkspace, not above its full-height scrolling layout.
  return null;
}

export function RentalComparisonStatus({ message }: { message: string | null }) {
  return message ? (
    <p role="status" data-testid="rental-comparison-unavailable" className="mb-3 text-sm text-muted-foreground">
      {message}
    </p>
  ) : null;
}
