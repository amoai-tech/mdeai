"use client";

import { useLayoutEffect, useRef } from "react";
import { useGenerativeUIFunction } from "@copilotkit/react-core/v2/generative-ui";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
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
}: {
  results: readonly Rental[];
  onOpenDetails: (rental: Rental) => void;
  onScheduleViewing: (rental: Rental) => void;
}) {
  const latest = useRef({ results, onOpenDetails, onScheduleViewing });
  useLayoutEffect(() => {
    latest.current = { results, onOpenDetails, onScheduleViewing };
  }, [results, onOpenDetails, onScheduleViewing]);

  useGenerativeUIFunction(mdeUI, "openComparedRentalDetails", ({ listingId }) => {
    const row = currentComparedRental(latest.current.results, listingId);
    if (!row) return { ok: false, error: "This apartment is no longer in the current results." };
    latest.current.onOpenDetails(row);
    return { ok: true, status: "details_opened" };
  });

  useGenerativeUIFunction(mdeUI, "requestComparedRentalViewing", ({ listingId }) => {
    const row = currentComparedRental(latest.current.results, listingId);
    if (!row) return { ok: false, error: "This apartment is no longer in the current results." };
    // Opening the existing review modal is not the same as booking a viewing.
    latest.current.onScheduleViewing(row);
    return { ok: true, status: "viewing_review_opened" };
  });

  return null;
}
