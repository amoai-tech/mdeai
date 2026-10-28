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
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusPinId]);
}
