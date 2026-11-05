"use client";

import { useEffect } from "react";

/**
 * SAN-1638 — Escape closes an open Details panel.
 *
 * The phone panel is a Sheet and already handles Escape. The desktop panel is a non-modal
 * region over the map, so without this a keyboard user has no quick exit beyond tabbing to the
 * Close button. The listener is only attached while a panel is actually open.
 */
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Let an inner modal (Sheet, dialog) handle its own Escape first.
      if (event.defaultPrevented) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);
}
