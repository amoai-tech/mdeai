"use client";

import { useCallback, useRef } from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import type { EventCard } from "@/mastra/tools/search-events";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { useEventFastPath } from "@/components/chat/event-fast-path-context";
import { useClearOtherFastPathResults } from "@/hooks/use-clear-other-fast-path-results";
import { EVENT_CLARIFY_MESSAGE } from "@/lib/event-clarify-copy";
import { eventIdFromDetailAsk, summarizePublicEventForChat } from "@/lib/events/event-detail-chat";
import type { PublicEventDetail } from "@/lib/events/types";
import {
  buildEventSearchParams,
  canFastPathEventSearch,
  eventCardsToPanelRows,
  eventCardsToToolEnvelope,
  eventSearchParamsFromChip,
  fastPathAssistantSummary,
  fastPathEventFallbackSummary,
  shouldInstantEventClarify,
  type EventSearchApiParams,
} from "@/lib/event-search-fast-path";
import type { ConciergeWorkingMemory } from "@/lib/types";
import { useEventSearchResults } from "@/components/chat/event-search-results-context";
import { useMapContext } from "@/platform/maps/map-context";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import type { FilterChipDef } from "@/platform/copilot/chat-filter-chips";

type EventSearchResponse = {
  results: EventCard[];
  hybridUsed?: boolean;
  rankExplanation?: Array<{ factor: string; score: number; note: string }>;
};

async function fetchEventSearch(
  params: EventSearchApiParams,
): Promise<EventSearchResponse> {
  const res = await fetch("/api/events/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`event search failed: ${res.status}`);
  }
  const data = (await res.json()) as EventSearchResponse;
  return { ...data, results: data.results ?? [] };
}

export function useEventSearchFastPath() {
  const { state, setState } = useConciergeCoAgent();
  const { clarifyPending, clarifyKind, showClarify, showExchange, clearLocalMessages } =
    useEventLocalChat();
  const { setToolResult } = useEventFastPath();
  const clearOthers = useClearOtherFastPathResults();
  const { setRows, setWebCitations } = useEventSearchResults();
  const { mergePinsByCategory, requestFitBounds } = useMapContext();
  const busyRef = useRef(false);

  const applySearchResults = useCallback(
    (
      cards: EventCard[],
      query: ConciergeWorkingMemory["lastEventQuery"],
      memory: ConciergeWorkingMemory,
      meta?: {
        hybridUsed?: boolean;
        rankExplanation?: Array<{ factor: string; score: number; note: string }>;
      },
    ) => {
      clearOthers("event");
      const envelope = eventCardsToToolEnvelope(cards, meta);
      setToolResult(envelope);
      setWebCitations([]);
      setRows(
        cards.map((e) => ({
          id: e.id,
          title: e.title,
          venue: e.venue,
          neighborhood: e.neighborhood,
          startsAt: e.startsAt,
          pricePerTicket: e.pricePerTicket,
          currency: e.currency,
          canBuyTickets: e.canBuyTickets,
          ticketUrl: e.ticketUrl,
          imageUrl: e.imageUrl,
          sourceUrl: e.sourceUrl ?? e.mapsUrl ?? undefined,
        })),
      );
      const { pins } = normalizeToolOutput("event", envelope);
      // Always replace the category (an empty set clears the previous search's pins); only zoom to fit
      // when there is something to fit.
      mergePinsByCategory("event", pins);
      if (pins.length >= 2) requestFitBounds();
      setState({
        ...memory,
        lastIntent: "event_discovery",
        lastEventQuery: query,
        lastEventResults: eventCardsToPanelRows(cards),
      });
      return pins.length;
    },
    [mergePinsByCategory, requestFitBounds, setRows, setToolResult, setWebCitations, setState, clearOthers],
  );

  const runSearch = useCallback(
    async (
      userText: string,
      params: EventSearchApiParams,
      memory: ConciergeWorkingMemory,
      propagateFailure = false,
    ): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      try {
        let { results: cards, hybridUsed, rankExplanation } =
          await fetchEventSearch(params);
        let usedFallback = false;
        if (
          cards.length === 0 &&
          params.dateWindow &&
          params.dateWindow !== "any"
        ) {
          const fallback = await fetchEventSearch({ ...params, dateWindow: "any" });
          cards = fallback.results;
          hybridUsed = fallback.hybridUsed;
          rankExplanation = fallback.rankExplanation;
          usedFallback = cards.length > 0;
        }
        const query: ConciergeWorkingMemory["lastEventQuery"] = {
          category: params.category,
          neighborhood: params.neighborhood,
          dateWindow: usedFallback ? "any" : (params.dateWindow ?? "any"),
          genericAskPending: false,
        };
        const pinCount = applySearchResults(cards, query, memory, { hybridUsed, rankExplanation });
        const summary = usedFallback
          ? fastPathEventFallbackSummary(cards.length, pinCount, params.dateWindow)
          : fastPathAssistantSummary(cards.length, pinCount);
        showExchange(userText, summary);
        return true;
      } catch (err) {
        console.error("[event-fast-path]", err);
        setToolResult(null);
        // Chat sends must reach the operation-aware Retry handler. Filter-chip
        // searches retain their existing non-throwing failure behavior.
        if (propagateFailure) throw err;
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [applySearchResults, showExchange, setToolResult],
  );

  const handleUserMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      if (clarifyPending && clarifyKind === "restaurant") return false;
      if (clarifyPending && clarifyKind === "rental") return false;

      const memory: ConciergeWorkingMemory = {
        ...(state ?? {}),
        lastEventQuery: clarifyPending
          ? {
              ...(state?.lastEventQuery ?? {}),
              genericAskPending: true,
            }
          : state?.lastEventQuery,
      };

      // The event detail CTA contains an exact, validated public event ID.
      // A generic discovery clarification is misleading here, especially for guests.
      // Reuse the same published/active/RLS-filtered server endpoint as event checkout.
      const eventId = eventIdFromDetailAsk(trimmed);
      if (eventId) {
        if (busyRef.current) return false;
        busyRef.current = true;
        try {
          const response = await fetch(`/api/events/${eventId}/public`, { cache: "no-store" });
          if (response.status === 404) {
            showExchange(trimmed, "This event is no longer publicly listed. Explore current events at /events.");
            return true;
          }
          if (!response.ok) throw new Error(`public event context failed: ${response.status}`);
          const payload = (await response.json()) as { event?: PublicEventDetail };
          if (!payload.event || payload.event.id !== eventId) {
            throw new Error("public event context did not match the requested event");
          }
          clearLocalMessages();
          clearOthers("event");
          setToolResult(null);
          showExchange(trimmed, summarizePublicEventForChat(payload.event));
          return true;
        } finally {
          busyRef.current = false;
        }
      }

      if (shouldInstantEventClarify(trimmed, memory)) {
        if (busyRef.current) return false;
        busyRef.current = true;
        try {
          setToolResult(null);
          clearOthers("event");
          showClarify(trimmed, EVENT_CLARIFY_MESSAGE, "event");
          return true;
        } finally {
          busyRef.current = false;
        }
      }

      if (!canFastPathEventSearch(trimmed, memory)) return false;

      const params = buildEventSearchParams(trimmed, memory);
      if (!params) return false;

      // A busy handler cannot claim it accepted a second turn without retaining it.
      if (busyRef.current) return false;
      clearLocalMessages();
      return runSearch(trimmed, params, memory, true);
    },
    [clarifyKind, clarifyPending, clearLocalMessages, clearOthers, runSearch, setToolResult, showClarify, showExchange, state],
  );

  const handleEventChip = useCallback(
    async (
      chip: FilterChipDef,
      prompt: string,
      memoryOverride?: ConciergeWorkingMemory,
    ): Promise<boolean> => {
      const params = eventSearchParamsFromChip(chip);
      const memory = memoryOverride ?? { ...(state ?? {}) };
      return runSearch(prompt, params, memory);
    },
    [runSearch, state],
  );

  return { handleUserMessage, handleEventChip };
}
