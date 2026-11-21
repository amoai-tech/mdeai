"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFrontendTool, type AbstractAgent } from "@copilotkit/react-core/v2";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";
import type { RentalBrowseFilterState } from "@/lib/rentals/browse-filters";
import { rentalPageControlSchema, resolveRentalPageControl } from "@/lib/rentals/browse-page-control";
import type { EventBrowseFilterState } from "@/lib/events/browse-url";
import { eventPageControlSchema, resolveEventPageControl } from "@/lib/events/browse-page-control";

/**
 * Preserve a user's newer native filter edit while an older agent run is in flight.
 * A run can change the page only if the URL-backed filters still match its start.
 * No second filter store: all current values come from the page's real URL state.
 */
function usePageFilterRunSnapshot<T extends object>(filters: T, agent: AbstractAgent) {
  const filtersRef = useRef(filters);
  const manualEditCountRef = useRef(0);
  // A filter Link navigates asynchronously. A delayed RUN_STARTED must not
  // turn that pending human navigation into the snapshot of an "old" run.
  const pendingNavigationFromRef = useRef<string | null>(null);
  // A page mounted mid-run must not accept a late tool from the previous page.
  const startedWithRef = useRef<{ filters: string; manualEdits: number } | null>(
    agent.isRunning ? { filters: "", manualEdits: -1 } : null,
  );
  useLayoutEffect(() => {
    filtersRef.current = filters;
    // Update before click events; never infer completion from an old effect snapshot.
    if (pendingNavigationFromRef.current &&
        pendingNavigationFromRef.current !== JSON.stringify(filters)) {
      pendingNavigationFromRef.current = null;
    }
  }, [filters]);
  useEffect(() => {
    // A native Link click starts navigation before new server props arrive.
    // Record the user's intent synchronously so an AI tool cannot race that click.
    const onManualFilterClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const linkOrAction = event.target.closest(
        '[data-testid="workspace-filters"] a[href], [data-testid="rentals-dates-apply"], [data-testid="rentals-dates-clear"]',
      );
      if (!linkOrAction) return;
      if (linkOrAction.matches('a[href]')) {
        // Opening a filter link in another tab must not invalidate this page.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey ||
            event.altKey || linkOrAction.getAttribute("target") === "_blank") return;
        // Only filter fields are authoritative: a tracking parameter or
        // explicit dateWindow=any can disappear without changing a filter.
        const destination = new URL(linkOrAction.getAttribute("href")!, window.location.href);
        const current = new URL(window.location.href);
        const sameFilters = Object.entries(filtersRef.current).every(([key, value]) => {
          const target = destination.searchParams.get(key);
          const normalizedTarget = key === "dateWindow" && target === "any" ? null : target;
          const normalizedCurrent = key === "dateWindow" && value === "any" ? null : value ?? null;
          return normalizedTarget === normalizedCurrent;
        });
        if (destination.origin === current.origin &&
            destination.pathname === current.pathname && sameFilters) return;
        pendingNavigationFromRef.current = JSON.stringify(filtersRef.current);
      }
      manualEditCountRef.current += 1;
    };
    document.addEventListener("click", onManualFilterClick, true);
    return () => document.removeEventListener("click", onManualFilterClick, true);
  }, []);
  useEffect(() => {
    const subscription = agent.subscribe({
      onRunInitialized: () => {
        startedWithRef.current = pendingNavigationFromRef.current !== null
          ? { filters: "", manualEdits: -1 }
          : {
              filters: JSON.stringify(filtersRef.current),
              manualEdits: manualEditCountRef.current,
            };
      },
      // A failed or canceled navigation must not block future Ask turns forever.
      // A tool from this run cannot execute after its finalization/failure.
      onRunFinalized: () => { pendingNavigationFromRef.current = null; },
      onRunFailed: () => { pendingNavigationFromRef.current = null; },
    });
    return () => {
      subscription.unsubscribe();
      startedWithRef.current = null;
    };
  }, [agent]);
  return {
    filtersRef,
    isStale: () =>
      startedWithRef.current !== null &&
      (startedWithRef.current.filters !== JSON.stringify(filtersRef.current) ||
        startedWithRef.current.manualEdits !== manualEditCountRef.current),
  };
}

function RentalPageControlLive({ filters, agent }: { filters: RentalBrowseFilterState; agent: AbstractAgent }) {
  const router = useRouter();
  const { filtersRef, isStale } = usePageFilterRunSnapshot(filters, agent);

  useFrontendTool(
    {
      name: "updateRentalBrowseFilters",
      followUp: false,
      description:
        "Change the native filters on the visible Rentals page. Call this when the renter says 'on this page', 'set the filters', 'show only ... on the page', or otherwise asks to change what is currently displayed. This updates the existing URL and native cards/map; it is not a new search. Never use it to invent listings, prices or availability. Omit fields that stay unchanged; pass null to clear one.",
      parameters: rentalPageControlSchema,
      handler: async (patch) => {
        if (isStale()) {
          return { ok: false, error: "The page filters changed while I was responding. Your latest choices were kept." };
        }
        const result = resolveRentalPageControl(filtersRef.current, patch);
        if (!result.ok) return result;
        router.push(result.url);
        return { ok: true, status: "navigation_requested", url: result.url };
      },
    },
    [],
  );
  return null;
}

function EventPageControlLive({ filters, agent }: { filters: EventBrowseFilterState; agent: AbstractAgent }) {
  const router = useRouter();
  const { filtersRef, isStale } = usePageFilterRunSnapshot(filters, agent);

  useFrontendTool(
    {
      name: "updateEventBrowseFilters",
      followUp: false,
      description:
        "Change the native filters on the visible Events page. Call this when the visitor says 'on this page', 'set the filters', or asks to change what is currently displayed. Use only page-displayed filters: category, neighborhood, date window (tonight, this weekend, this week, next week, any) or free/paid. Salsa is a search intent, not a category; use the existing event search for it. Never invent events, dates or prices. Omit fields that stay unchanged; pass null to clear one.",
      parameters: eventPageControlSchema,
      handler: async (patch) => {
        if (isStale()) {
          return { ok: false, error: "The page filters changed while I was responding. Your latest choices were kept." };
        }
        const result = resolveEventPageControl(filtersRef.current, patch);
        if (!result.ok) return result;
        router.push(result.url);
        return { ok: true, status: "navigation_requested", url: result.url };
      },
    },
    [],
  );
  return null;
}

/** Mounted only on the page, inside the existing concierge provider. */
export function RentalPageControlTool({ filters }: { filters: RentalBrowseFilterState }) {
  const agent = useOptionalConciergeCoAgent();
  if (!agent?.agent || isDeterministicE2E()) return null;
  return <RentalPageControlLive filters={filters} agent={agent.agent} />;
}

/** Mounted only on the page, inside the existing concierge provider. */
export function EventPageControlTool({ filters }: { filters: EventBrowseFilterState }) {
  const agent = useOptionalConciergeCoAgent();
  if (!agent?.agent || isDeterministicE2E()) return null;
  return <EventPageControlLive filters={filters} agent={agent.agent} />;
}
