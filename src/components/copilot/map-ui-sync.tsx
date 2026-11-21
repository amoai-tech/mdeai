"use client";

import { useCallback, useEffect, useRef } from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { buildMapUiSummary } from "@/lib/map-ui-summary";
import { useMapContext } from "@/platform/maps/map-context";

const DEBOUNCE_MS = 300;

function roundViewport(viewport: {
  lat: number;
  lng: number;
  zoom: number;
}): { lat: number; lng: number; zoom: number } {
  return {
    lat: Math.round(viewport.lat * 1e5) / 1e5,
    lng: Math.round(viewport.lng * 1e5) / 1e5,
    zoom: Math.round(viewport.zoom * 100) / 100,
  };
}

/** Pushes MapContext summary into concierge working memory (debounced). */
export function MapUiSync() {
  const { pins, selectedPinId, viewport } = useMapContext();
  const { setState, isReady } = useConciergeCoAgent();
  const setStateRef = useRef(setState);
  const latestRef = useRef({ pins, selectedPinId, viewport });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedRef = useRef<string>("");

  useEffect(() => {
    setStateRef.current = setState;
  }, [setState]);

  // Effects run in declaration order: the latest map snapshot is current before
  // either publisher runs.
  useEffect(() => {
    latestRef.current = { pins, selectedPinId, viewport };
  }, [pins, selectedPinId, viewport]);

  const publish = useCallback(() => {
    if (!isReady) return;
    const latest = latestRef.current;
    const mapUi = buildMapUiSummary(
      latest.pins,
      latest.selectedPinId,
      latest.viewport ? roundViewport(latest.viewport) : undefined,
    );
    const fingerprint = JSON.stringify(mapUi);
    if (fingerprint === lastPushedRef.current) return;
    lastPushedRef.current = fingerprint;
    setStateRef.current((prev) => ({ ...(prev ?? {}), mapUi }));
  }, [isReady]);

  // Selection is a deliberate user action and must be visible to the very next
  // Ask turn; never place it behind the camera debounce.
  useEffect(() => {
    publish();
  }, [selectedPinId, publish]);

  // Camera movement is high frequency; keep the existing 300 ms debounce.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(publish, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pins, viewport, publish]);

  return null;
}
