"use client";

import { useEffect, useRef } from "react";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { useMapContext } from "@/platform/maps/map-context";

const focusMapPinParams = z.object({
  pinId: z.string().describe("Map pin id (often rental-{listingId})"),
});

type PageFocus = (pinId: string) => { ok: true } | { ok: false; message: string };

export function useFocusMapPinAction(onPageFocus?: PageFocus) {
  const { panToPin, pins } = useMapContext();

  const pinsRef = useRef(pins);
  const panToPinRef = useRef(panToPin);
  const pageFocusRef = useRef(onPageFocus);
  useEffect(() => {
    pinsRef.current = pins;
    panToPinRef.current = panToPin;
    pageFocusRef.current = onPageFocus;
  }, [pins, panToPin, onPageFocus]);

  useFrontendTool(
    {
      name: "focusMapPin",
      ...(onPageFocus ? { followUp: false } : {}),
      description:
        "Pan the map to highlight a listing or place pin by pinId. Use when the user asks to show a result on the map.",
      parameters: focusMapPinParams,
      handler: async ({ pinId }) => {
        if (pageFocusRef.current) {
          const result = pageFocusRef.current(pinId);
          return result.ok ? "Map selection accepted by the page." : result.message;
        }
        const currentPins = pinsRef.current;
        const resolved =
          currentPins.find((p) => p.id === pinId)?.id ??
          currentPins.find((p) => p.id === `rental-${pinId}`)?.id;
        if (!resolved) {
          return "Map action failed: this result has no recorded map location in the current pins. Do not claim it was focused.";
        }
        panToPinRef.current(resolved);
        return `Focused map on pin ${resolved}`;
      },
    },
    [],
  );
}

/** Mount inside MapsShell — requires MapContextProvider. */
export function FocusMapPinAction({ onPageFocus }: { onPageFocus?: PageFocus } = {}) {
  useFocusMapPinAction(onPageFocus);
  return null;
}
