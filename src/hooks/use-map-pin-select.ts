"use client";

import { useMapContext } from "@/platform/maps/map-context";
import { nextPinSelection } from "@/platform/maps/pin-selection";

/**
 * Card/pin selection with a working "clear": clicking the selected card again deselects it instead
 * of leaving `aria-pressed="true"` with no way out (SAN-1146).
 *
 * Selecting still goes through `panToPin`, so the map keeps its existing pan + focus behaviour.
 * Used by cafés, nightlife and restaurants, which is why the rule lives in one place.
 */
export function useMapPinSelect() {
  const { selectedPinId, setSelectedPinId, panToPin } = useMapContext();

  return function selectPin(targetPinId: string) {
    const next = nextPinSelection(selectedPinId, targetPinId);
    if (next === null) {
      setSelectedPinId(null);
      return;
    }
    panToPin(next);
  };
}
