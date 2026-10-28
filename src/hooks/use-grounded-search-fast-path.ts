"use client";

import { useCallback, useRef } from "react";
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

export function useGroundedSearchFastPath() {
  const { setState } = useConciergeCoAgent();
  const { showExchange, clearLocalMessages } = useEventLocalChat();
  const clearOthers = useClearOtherFastPathResults();
  const { setToolResult } = useGroundedFastPath();
  const { mergePinsByCategory, requestFitBounds } = useMapContext();
  const busyRef = useRef(false);

  const applySearchResults = useCallback(
    (envelope: unknown) => {
      const { pins } = normalizeToolOutput("grounded", envelope);
      // A grounded search with nothing to pin replaces the other result panels but keeps their pins.
      clearOthers("grounded", { clearOtherPins: pins.length > 0 });
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
    [mergePinsByCategory, requestFitBounds, setState, setToolResult, clearOthers],
  );

  const runSearch = useCallback(
    async (
      userText: string,
      params: CafeSearchApiParams,
    ): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      try {
        const envelope = await fetchGroundedSearch(params);
        const { count, pinCount } = applySearchResults(envelope);
        showExchange(
          userText,
          fastPathCafeSummary(count, pinCount, params.neighborhood, userText),
        );
        return true;
      } catch (err) {
        console.error("[grounded-fast-path]", err);
        setToolResult(null);
        // This is a failed café search, not an unhandled intent: report it
        // to the send pipeline so Try again replays the same search.
        throw err;
      } finally {
        busyRef.current = false;
      }
    },
    [
      applySearchResults,
      setToolResult,
      showExchange,
    ],
  );

  const handleUserMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      if (!canFastPathCafeSearch(trimmed)) return false;

      const params = buildCafeSearchParams(trimmed);
      if (!params) return false;

      if (busyRef.current) return false;
      clearLocalMessages();
      return runSearch(trimmed, params);
    },
    [clearLocalMessages, runSearch],
  );

  return { handleUserMessage };
}
