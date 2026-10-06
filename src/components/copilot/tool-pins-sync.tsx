"use client";

import { useEffect, useRef } from "react";
import { isFinishedToolPayload } from "@/lib/normalize-tool-envelope";
import { useMapContext } from "@/platform/maps/map-context";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import type { MapPinCategory } from "@/platform/contracts";

export function ToolPinsSync({
  category,
  result,
}: {
  category: MapPinCategory;
  result: unknown;
}) {
  const { mergePinsByCategory } = useMapContext();
  const lastMergedKeyRef = useRef("");

  useEffect(() => {
    // SAN-1422 — only a missing or still-streaming result is a no-op. A finished result always
    // replaces its category, including with no pins, so a coordinate-less search can't leave the
    // previous search's pins on the map.
    if (!isFinishedToolPayload(result)) return;
    const { pins } = normalizeToolOutput(category, result);
    // The location is part of the key: the same pin id with corrected coordinates is a real update.
    const key = `${category}:${pins
      .map((p) => `${p.id}@${p.lat},${p.lng}`)
      .sort()
      .join("|")}`;
    if (key === lastMergedKeyRef.current) return;
    lastMergedKeyRef.current = key;
    // UX-033 / J15 — agent tool path: a grounded search that found places replaces stale rental/event
    // pins. One that found nothing must not erase them.
    if (category === "grounded" && pins.length > 0) {
      mergePinsByCategory("rental", []);
      mergePinsByCategory("event", []);
    }
    mergePinsByCategory(category, pins);
  }, [category, result, mergePinsByCategory]);

  return null;
}
