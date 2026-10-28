"use client";

import { useCallback } from "react";
import { useMapContext } from "@/platform/maps/map-context";
import { nextPinSelection } from "@/platform/maps/pin-selection";

/**
 * Card/pin selection with a working "clear": clicking the selected card again deselects it instead
 * of leaving `aria-pressed="true"` with no way out (SAN-1146).
 *
 * Selecting still goes through `panToPin`, so the map keeps its existing pan + focus behaviour.
 */
export function useMapPinSelect() {
  const { selectedPinId, setSelectedPinId, panToPin } = useMapContext();

  return useCallback(
    (pinId: string) => {
      const next = nextPinSelection(selectedPinId, pinId);
      if (next === null) {
        setSelectedPinId(null);
        return;
      }
      panToPin(next);
    },
    [selectedPinId, setSelectedPinId, panToPin],
  );
}
