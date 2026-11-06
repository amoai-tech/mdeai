"use client";

import { useCallback } from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { useClearOtherFastPathResults } from "@/hooks/use-clear-other-fast-path-results";
import { useGroundedFastPath } from "@/components/chat/grounded-fast-path-context";
import {
  buildCafeSearchParams,
  canFastPathCafeSearch,
  fastPathCafeSummary,
  type CafeSearchApiParams,
} from "@/lib/cafe-search-fast-path";
import { useMapContext } from "@/platform/maps/map-context";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import {
  parseGroundedToolResult,
  resolveGroundedTitle,
} from "@/lib/parse-grounded-tool-result";
import { isSelectedRentalCafeNearbyRequest, isStoredRentalUuid, nearbyCafeRadiusMeters } from "@/lib/cafe-search-fast-path";

async function fetchGroundedSearch(
  params: CafeSearchApiParams,
): Promise<unknown> {
  const res = await fetch("/api/grounded/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`grounded search failed: ${res.status}`);
  }
  return res.json();
}

// All card actions and the composer share the same provider setter identity.
// One concurrent search per visible conversation; no process-global user state.
const groundedSearchesInFlight = new WeakSet<(result: unknown | null) => void>();

export function useGroundedSearchFastPath() {
  const { setState } = useConciergeCoAgent();
  const { showExchange, clearLocalMessages } = useEventLocalChat();
  const clearOthers = useClearOtherFastPathResults();
  const { setToolResult } = useGroundedFastPath();
  const { mergePinsByCategory, requestFitBounds, pins: currentPins, selectedPinId } = useMapContext();

  const applySearchResults = useCallback(
    (envelope: unknown) => {
      const { pins } = normalizeToolOutput("grounded", envelope);
      // Nearby results MUST keep the matching rental's card and marker.
      // Independent grounded discovery continues replacing stale categories.
      const metadata = envelope && typeof envelope === "object"
        ? (envelope as { metadata?: { searchMode?: string; anchorPinId?: string } }).metadata
        : undefined;
      const preserveRental = metadata?.searchMode === "nearby" &&
        currentPins.some((pin) => pin.category === "rental" && pin.id === metadata.anchorPinId);
      if (!preserveRental) {
        clearOthers("grounded", { clearOtherPins: pins.length > 0 });
      }
      setToolResult(envelope);
      mergePinsByCategory("grounded", pins);
      if (pins.length >= 2) requestFitBounds();
      const count =
        envelope &&
        typeof envelope === "object" &&
        Array.isArray((envelope as { results?: unknown[] }).results)
          ? (envelope as { results: unknown[] }).results.length
          : 0;
      // The fast path bypasses Mastra, so the cards on screen are invisible to the agent
      // unless we hand over a compact copy. Follow-ups such as "which of these would you
      // recommend?" must name a real row and must not invent amenities from nothing.
      const parsed = parseGroundedToolResult(envelope);
      const lastGroundedResults = parsed.results.slice(0, 5).map((row, index) => ({
        id: row.id,
        title: resolveGroundedTitle(row, index, parsed.attribution, row.mapsUrl),
        ...(row.formattedAddress ? { area: row.formattedAddress.slice(0, 140) } : {}),
        ...(row.summary ? { summary: row.summary.slice(0, 240) } : {}),
        ...(row.rating != null ? { rating: row.rating } : {}),
      }));
      setState((prev) => ({
        ...(prev ?? {}),
        lastIntent: "restaurant_discovery",
        lastGroundedResults,
      }));
      return { count, pinCount: pins.length };
    },
    [mergePinsByCategory, requestFitBounds, setState, setToolResult, clearOthers, currentPins],
  );

  const runSearch = useCallback(
    async (
      userText: string,
      params: CafeSearchApiParams,
      submissionId?: string,
    ): Promise<boolean> => {
      if (groundedSearchesInFlight.has(setToolResult)) return false;
      groundedSearchesInFlight.add(setToolResult);
      try {
        const envelope = await fetchGroundedSearch(params);
        const { count, pinCount } = applySearchResults(envelope);
        const reason = envelope && typeof envelope === "object"
          ? (envelope as { metadata?: { reason?: string } }).metadata?.reason
          : undefined;
        const summary = params.nearbyRentalId
          ? reason
            ? "Could not verify nearby cafés for this apartment right now. Try again or choose another apartment."
            : count === 0
              ? `No cafés found within ${params.nearbyRadiusMeters ?? 800} m of this apartment.`
              : `Found ${count} café${count === 1 ? "" : "s"} within ${params.nearbyRadiusMeters ?? 800} m of this apartment.`
          : fastPathCafeSummary(count, pinCount, params.neighborhood, userText);
        showExchange(userText, summary, submissionId);
        return true;
      } catch (err) {
        console.error("[grounded-fast-path]", err);
        setToolResult(null);
        // This is a failed café search, not an unhandled intent: report it
        // to the send pipeline so Try again replays the same search.
        throw err;
      } finally {
        groundedSearchesInFlight.delete(setToolResult);
      }
    },
    [
      applySearchResults,
      setToolResult,
      showExchange,
    ],
  );

  const handleUserMessage = useCallback(
    async (text: string, submissionId?: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      // The user selected a real mapped rental. Reuse the existing grounded
      // route with server-only RLS coordinate lookup instead of re-running rentals.
      if (isSelectedRentalCafeNearbyRequest(trimmed)) {
        const rentalPin = currentPins.find(
          (pin) => pin.category === "rental" && pin.id === selectedPinId,
        );
        if (!rentalPin) return false;
        const rentalId = rentalPin.id.slice("rental-".length);
        const radius = nearbyCafeRadiusMeters(trimmed);
        if (!isStoredRentalUuid(rentalId) || radius === null) return false;
        if (groundedSearchesInFlight.has(setToolResult)) return false;
        clearLocalMessages();
        return runSearch(trimmed, {
          query: trimmed,
          intent: "cafe",
          limit: 5,
          nearbyRentalId: rentalId,
          nearbyRadiusMeters: radius,
        }, submissionId);
      }
      if (!canFastPathCafeSearch(trimmed)) return false;

      const params = buildCafeSearchParams(trimmed);
      if (!params) return false;

      if (busyRef.current) return false;
      clearLocalMessages();
      return runSearch(trimmed, params, submissionId);
    },
    [clearLocalMessages, runSearch, currentPins, selectedPinId, setToolResult],
  );

  // A card action uses the SAME read-only Nearby fast path as a typed
  // contextual query. Never send a second agent turn or guess a map origin.
  const searchNearbyRental = useCallback(async (rentalId: string): Promise<boolean> => {
    const pinId = `rental-${rentalId}`;
    if (groundedSearchesInFlight.has(setToolResult) || !isStoredRentalUuid(rentalId) ||
        !currentPins.some((pin) => pin.id === pinId && pin.category === "rental")) {
      return false;
    }
    const text = "Show nearby cafés for this apartment";
    clearLocalMessages();
    return runSearch(text, {
      query: text,
      intent: "cafe",
      limit: 5,
      nearbyRentalId: rentalId,
      nearbyRadiusMeters: 800,
    });
  }, [currentPins, clearLocalMessages, runSearch, setToolResult]);

  return { handleUserMessage, searchNearbyRental };
}
