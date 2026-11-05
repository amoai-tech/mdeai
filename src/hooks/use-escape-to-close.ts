"use client";

import { useEffect } from "react";

/** Marks the Details region so Escape can be limited to it. */
export const DETAILS_PANEL_ATTR = "data-details-panel";

/**
 * SAN-1638 — Escape closes an open Details panel.
 *
 * The phone panel is a Sheet and handles Escape itself. The desktop panel is a non-modal region
 * over the map, so it needs its own handler — but a `window` listener closed it on *any* Escape,
 * including inside the Ask composer, where that key belongs to the input and focus was being
 * pulled out of what the person was typing.
 *
 * So the key only closes Details when it came from inside the panel or from the page chrome
 * (body/html). Anything else keeps the key.
 */
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      const panel = document.querySelector(`[${DETAILS_PANEL_ATTR}]`);
      const fromPanel = panel?.contains(target) ?? false;
      const fromPageChrome = target === document.body || target === document.documentElement;
      if (!fromPanel && !fromPageChrome) return;
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);
}
