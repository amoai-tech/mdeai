"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";
import type { RentalBrowseFilterState } from "@/lib/rentals/browse-filters";
import { buildRentalPageControlUrl, rentalPageControlSchema } from "@/lib/rentals/browse-page-control";
import type { EventBrowseFilterState } from "@/lib/events/browse-url";
import { buildEventPageControlUrl, eventPageControlSchema } from "@/lib/events/browse-page-control";

function RentalPageControlLive({ filters }: { filters: RentalBrowseFilterState }) {
  const router = useRouter();
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useFrontendTool(
    {
      name: "updateRentalBrowseFilters",
      followUp: false,
      description:
        "Change the native filters on the visible Rentals page. Call this when the renter says 'on this page', 'set the filters', 'show only ... on the page', or otherwise asks to change what is currently displayed. This updates the existing URL and native cards/map; it is not a new search. Never use it to invent listings, prices or availability. Omit fields that stay unchanged; pass null to clear one.",
      parameters: rentalPageControlSchema,
      handler: async (patch) => {
        const url = buildRentalPageControlUrl(filtersRef.current, patch);
        router.push(url);
        return { ok: true, url, applied: patch };
      },
    },
    [],
  );
  return null;
}

function EventPageControlLive({ filters }: { filters: EventBrowseFilterState }) {
  const router = useRouter();
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useFrontendTool(
    {
      name: "updateEventBrowseFilters",
      followUp: false,
      description:
        "Change the native filters on the visible Events page. Call this when the visitor says 'on this page', 'set the filters', or asks to change what is currently displayed. Use only page-displayed filters: category, neighborhood, date window (tonight, this weekend, this week, next week, any) or free/paid. Salsa is a search intent, not a category; use the existing event search for it. Never invent events, dates or prices. Omit fields that stay unchanged; pass null to clear one.",
      parameters: eventPageControlSchema,
      handler: async (patch) => {
        const url = buildEventPageControlUrl(filtersRef.current, patch);
        router.push(url);
        return { ok: true, url, applied: patch };
      },
    },
    [],
  );
  return null;
}

/** Mounted only on the page, inside the existing concierge provider. */
export function RentalPageControlTool({ filters }: { filters: RentalBrowseFilterState }) {
  const agent = useOptionalConciergeCoAgent();
  if (!agent || isDeterministicE2E()) return null;
  return <RentalPageControlLive filters={filters} />;
}

/** Mounted only on the page, inside the existing concierge provider. */
export function EventPageControlTool({ filters }: { filters: EventBrowseFilterState }) {
  const agent = useOptionalConciergeCoAgent();
  if (!agent || isDeterministicE2E()) return null;
  return <EventPageControlLive filters={filters} />;
}
