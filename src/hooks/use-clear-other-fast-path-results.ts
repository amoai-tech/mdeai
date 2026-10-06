"use client";

import { useCallback } from "react";

import { useEventFastPath } from "@/components/chat/event-fast-path-context";
import { useEventSearchResults } from "@/components/chat/event-search-results-context";
import { useGroundedFastPath } from "@/components/chat/grounded-fast-path-context";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { useRestaurantFastPath } from "@/components/chat/restaurant-fast-path-context";

export type FastPathVertical = "rental" | "event" | "restaurant" | "grounded";

/**
 * SAN-966 — one place that removes every OTHER vertical's result panel (and the event source
 * citations) when a search lands, so the transcript tail only ever shows the latest search.
 * Each vertical's hook used to clear its own hand-picked subset of peers, which left e.g. the
 * restaurant panel behind after a rental search. Call `clearOthers("rental")` when the rental
 * results arrive; it never touches the vertical you pass in.
 *
 * Map pins are not handled here: they have their own per-category rules in each hook.
 */
export function useClearOtherFastPathResults() {
  const { setToolResult: setRental, setSearchMeta: setRentalSearchMeta } = useRentalFastPath();
  const { setToolResult: setEvent } = useEventFastPath();
  const { setToolResult: setRestaurant } = useRestaurantFastPath();
  const { setToolResult: setGrounded } = useGroundedFastPath();
  const { clearWebCitations } = useEventSearchResults();

  return useCallback(
    (keep: FastPathVertical) => {
      if (keep !== "rental") {
        setRental(null);
        setRentalSearchMeta(null);
      }
      if (keep !== "event") {
        setEvent(null);
        clearWebCitations();
      }
      if (keep !== "restaurant") setRestaurant(null);
      if (keep !== "grounded") setGrounded(null);
    },
    [setRental, setRentalSearchMeta, setEvent, setRestaurant, setGrounded, clearWebCitations],
  );
}
