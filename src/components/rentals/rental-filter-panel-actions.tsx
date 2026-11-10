"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useGenerativeUIFunction,
  useGenerativeUIState,
} from "@copilotkit/react-core/v2/generative-ui";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { isRentalBedValue, useRentalFilterDraft } from "@/components/rentals/rental-filter-draft";
import { buildRentalsUrl } from "@/lib/rentals/browse-filters";
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
/**
 * Refuse a duplicate or stale Apply without adding a second action system:
 * one click while a navigation is in flight, or a value the URL already has,
 * must not push again or fail silently.
 */
export function decideApply({
  inFlight,
  currentUrl,
  nextUrl,
}: {
  inFlight: boolean;
  currentUrl: string;
  nextUrl: string;
}): { ok: true } | { ok: false; error: string } {
  if (inFlight) return { ok: false, error: "Apply is already in progress." };
  if (currentUrl === nextUrl) return { ok: false, error: "Those filters are already applied." };
  return { ok: true };
}

export function RentalFilterPanelActions({ filters }: { filters: RentalBrowseFilterState }) {
  const { draftRef, setApplyError } = useRentalFilterDraft();
  const router = useRouter();
  const { neighborhood, beds: appliedBeds, from, through } = filters;
  const filtersRef = useRef(filters);
  const inFlightRef = useRef(false);
  // Depend on the primitive values: `filters` is a new object each render, so
  // using it would clear the in-flight guard mid-navigation and allow a second push.
  useEffect(() => {
    filtersRef.current = { neighborhood, beds: appliedBeds, from, through };
    inFlightRef.current = false;
  }, [neighborhood, appliedBeds, from, through]);

  // AI must see applied URL filters; an unapplied selection remains private draft state.
  useGenerativeUIState(mdeUI, "rentalFilters", { beds: filters.beds });

  useGenerativeUIFunction(mdeUI, "applyRentalFilters", () => {
    const beds = draftRef.current.beds;
    if (!isRentalBedValue(beds)) {
      const error = "Unsupported bedroom selection; nothing was applied.";
      setApplyError(error);
      return { ok: false, error };
    }
    const result = resolveRentalPageControl(filtersRef.current, { beds });
    if (!result.ok) {
      setApplyError(result.error);
      return result;
    }
    const decision = decideApply({
      inFlight: inFlightRef.current,
      currentUrl: buildRentalsUrl(filtersRef.current),
      nextUrl: result.url,
    });
    if (!decision.ok) {
      setApplyError(decision.error);
      return decision;
    }
    setApplyError(null);
    inFlightRef.current = true;
    router.push(result.url);
    return { ok: true, status: "navigation_requested", url: result.url };
  });

  return null;
}
