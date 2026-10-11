"use client";

import { useEffect, useRef } from "react";
import type { MapPin, MapPinCategory } from "@/platform/contracts/map-pin";
import { useMapContext } from "@/platform/maps/map-context";

export function useBrowseMapSync(
  pins: MapPin[],
  category: MapPinCategory,
) {
  const { mergePinsByCategory, requestFitBounds, selectedPinId, setSelectedPinId } = useMapContext();
  const prevKeyRef = useRef("");

  useEffect(() => {
    const key = `${category}:${pins
      .map((p) => `${p.id}:${p.lat}:${p.lng}:${p.title}:${p.subtitle ?? ""}`)
      .sort()
      .join("|")}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    mergePinsByCategory(category, pins);
    // Search/filter changes must not leave an old rental highlighted after its pin disappears.
    if (selectedPinId?.startsWith(`${category}-`) && !pins.some((pin) => pin.id === selectedPinId)) {
      setSelectedPinId(null);
    }
    if (pins.length >= 2) {
      requestFitBounds();
    }
  }, [pins, category, mergePinsByCategory, requestFitBounds, selectedPinId, setSelectedPinId]);
}
