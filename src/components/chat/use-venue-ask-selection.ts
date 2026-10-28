"use client";

import { useCallback, useEffect, useState } from "react";
import { useMapContext } from "@/platform/maps/map-context";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";

/** Keep a card's Ask selection and the canonical map selection in agreement. */
export function useVenueAskSelection(rows: GroundedToolRow[] | null, baseIds: string[]) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const { pins, selectedPinId, setSelectedPinId } = useMapContext();
  const mappedId = rows?.find((row) =>
    selectedPinId === `grounded-${row.id}` &&
    pins.some((pin) => pin.id === selectedPinId),
  )?.id ?? null;

  // Map selection has changed externally: don't restore the old Ask card on clear.
  useEffect(() => {
    // Map pin selection is an external UI event; invalidate the prior Ask card.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mappedId !== null) setSelectedCardId(null);
  }, [mappedId]);

  const selectedId = mappedId ?? (
    selectedCardId && (rows ? rows.some((r) => r.id === selectedCardId) : baseIds.includes(selectedCardId))
      ? selectedCardId : null
  );
  const selectForAsk = useCallback((id: string | null) => {
    setSelectedCardId(id);
    const pinId = id !== null && rows?.some((r) => r.id === id) &&
      pins.some((pin) => pin.id === `grounded-${id}`)
      ? `grounded-${id}` : null;
    setSelectedPinId(pinId);
  }, [pins, rows, setSelectedPinId]);
  const clearAskSelection = useCallback(() => {
    setSelectedCardId(null);
    setSelectedPinId(null);
  }, [setSelectedPinId]);
  return { selectedId, selectForAsk, clearAskSelection };
}
