"use client";

import { useEffect, useRef } from "react";
import { isFinishedToolPayload, unwrapAgUiToolPayload } from "@/lib/normalize-tool-envelope";
import { useMapContext } from "@/platform/maps/map-context";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import type { MapPin, MapPinCategory } from "@/platform/contracts";
import { useCurrentSearchToolResult } from "@/components/copilot/search-tool-result-ownership";

/**
 * Only a structured nearby tool result anchored to an existing rental can retain rental pins.
 * Standalone grounded searches must still clear stale rental/event results.
 * SAN-106 will populate this validated metadata in its canonical server tool output.
 */
function nearbyRentalAnchor(result: unknown, pins: MapPin[]): string | null {
  const body = unwrapAgUiToolPayload(result);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const metadata = (body as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const { searchMode, anchorPinId } = metadata as Record<string, unknown>;
  if (searchMode !== "nearby" || typeof anchorPinId !== "string") return null;
  return pins.some((pin) => pin.category === "rental" && pin.id === anchorPinId)
    ? anchorPinId
    : null;
}

export function ToolPinsSync({
  category,
  result,
}: {
  category: MapPinCategory;
  result: unknown;
}) {
  const { mergePinsByCategory, pins } = useMapContext();
  const isCurrent = useCurrentSearchToolResult();
  const lastMergedKeyRef = useRef("");
  const pinsRef = useRef(pins);

  // Refresh the pin snapshot without re-running an already consumed tool result.
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  useEffect(() => {
    // SAN-1422 — only a missing or still-streaming result is a no-op. A finished result always
    // replaces its category, including with no pins, so a coordinate-less search can't leave the
    // previous search's pins on the map.
    if (!isCurrent || !isFinishedToolPayload(result, { rowArray: category === "grounded" })) return;
    const { pins: resultPins } = normalizeToolOutput(category, result);
    const anchorPinId = category === "grounded" ? nearbyRentalAnchor(result, pinsRef.current) : null;
    // The location is part of the key: the same pin id with corrected coordinates is a real update.
    const key = `${category}:${anchorPinId ?? "independent"}:${resultPins
      .map((p) => `${p.id}@${p.lat},${p.lng}`)
      .sort()
      .join("|")}`;
    if (key === lastMergedKeyRef.current) return;
    lastMergedKeyRef.current = key;
    // UX-033 / J15 — agent tool path: a grounded search that found places replaces stale rental/event
    // pins. One that found nothing must not erase them.
    if (category === "grounded" && resultPins.length > 0 && !anchorPinId) {
      mergePinsByCategory("rental", []);
      mergePinsByCategory("event", []);
    }
    mergePinsByCategory(category, resultPins);
  }, [category, result, mergePinsByCategory, isCurrent]);

  return null;
}
