"use client";

import { useEffect } from "react";
import { useMapContext } from "@/platform/maps/map-context";

// Scrolls the matching card into view when the user clicks a map pin.
// Uses focusPinId (set only by panToPin/pin-click) to avoid scrolling on card hover.
//
// The request is cleared by MapFocusController after it pans (or when the pin is missing), never
// here: clearing from this effect could drop the request before the map has consumed it, so the
// map would stop following a marker click.
export function useBrowseCardScroll() {
  const { focusPinId } = useMapContext();

  useEffect(() => {
    if (!focusPinId) return;
    const card = document.querySelector(`[data-pin-id="${focusPinId}"]`);
    if (card instanceof HTMLElement) {
      // A map pin can target an apartment inside the collapsed other-results list.
      const disclosure = card.closest<HTMLDetailsElement>("details[data-map-expand]");
      if (disclosure) disclosure.open = true;
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusPinId]);
}
