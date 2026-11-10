"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useGenerativeUIFunction,
  useGenerativeUIState,
} from "@copilotkit/react-core/v2/generative-ui";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { isRentalBedValue, useRentalFilterDraft } from "@/components/rentals/rental-filter-draft";
import { resolveRentalPageControl } from "@/lib/rentals/browse-page-control";
import type { RentalBrowseFilterState } from "@/lib/rentals/browse-filters";

/**
 * SAN-1655 — publishes the live filters for the model and registers the one
 * action the Apply button may call.
 *
 * The handler reads the latest draft and the latest URL filters from refs, so a
 * delayed event can never push a stale combination. It reuses the same resolver
 * as the existing `updateRentalBrowseFilters` tool and reports
 * "navigation_requested", not "search completed".
 */
export function RentalFilterPanelActions({ filters }: { filters: RentalBrowseFilterState }) {
  const { draft, draftRef } = useRentalFilterDraft();
  const router = useRouter();
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useGenerativeUIState(mdeUI, "rentalFilters", { beds: draft.beds });

  useGenerativeUIFunction(mdeUI, "applyRentalFilters", () => {
    const beds = draftRef.current.beds;
    if (!isRentalBedValue(beds)) {
      return { ok: false, error: "Unsupported bedroom selection; nothing was applied." };
    }
    const result = resolveRentalPageControl(filtersRef.current, { beds });
    if (!result.ok) return result;
    router.push(result.url);
    return { ok: true, status: "navigation_requested", url: result.url };
  });

  return null;
}
