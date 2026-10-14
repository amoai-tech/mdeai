"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import type { Rental } from "@/mastra/tools/search-rentals";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { useClearOtherFastPathResults } from "@/hooks/use-clear-other-fast-path-results";
import {
  buildRentalSearchParams,
  canFastPathRentalSearch,
  fastPathRentalSummary,
  rentalsToPanelRows,
  rentalsToToolEnvelope,
  type RentalSearchApiParams,
} from "@/lib/rental-search-fast-path";
import { logRoutingDecision } from "@/lib/intelligence-telemetry";
import { scoreRentalQuery, statesBudget } from "@/lib/rental-query-parser";
import { RENTAL_HANDOFF_FAILED_SUMMARY, RENTAL_SEARCH_UNAVAILABLE_SUMMARY } from "@/lib/rental-display";
import type { ConciergeWorkingMemory } from "@/lib/types";
import { useMapContext } from "@/platform/maps/map-context";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";

import type { RentalQuerySignals } from "@/lib/rental-query-parser";

function buildRentalSlots(
  s: RentalQuerySignals,
): Record<string, string | number | boolean> {
  const slots: Record<string, string | number | boolean> = {};
  if (s.neighborhood) slots.neighborhood = s.neighborhood;
  if (s.maxPricePerNight != null) slots.maxPricePerNight = s.maxPricePerNight;
  if (s.minBedrooms != null) slots.bedrooms = s.minBedrooms;
  if (s.budgetType) slots.budgetType = s.budgetType;
  if (s.cityWide) slots.cityWide = true;
  if (s.dateRangeLabel) slots.dateRange = s.dateRangeLabel;
  if (s.hasBudget) slots.hasBudget = true;
  if (s.hasBedrooms) slots.hasBedrooms = true;
  return slots;
}

type RentalSearchResponse = {
  results: Rental[];
  budgetNote?: string;
  hybridUsed?: boolean;
  rankExplanation?: Array<{ factor: string; score: number; note: string }>;
};

/** A non-2xx answer from the search API, with its status so callers can tell 4xx from 5xx. */
class RentalSearchHttpError extends Error {
  constructor(readonly status: number) {
    super(`rental search failed: ${status}`);
    this.name = "RentalSearchHttpError";
  }
}

/**
 * "Temporarily unavailable" is only true for a network failure, a 5xx, a timeout or a rate limit.
 * A 400/401/403/404 is a problem with the request itself, and a malformed answer (bad JSON, an
 * unexpected exception) is a bug: retrying cannot help either, so neither may be presented to the
 * renter as an outage. Those go to the concierge and are logged.
 */
function isTemporaryOutage(err: unknown): boolean {
  if (err instanceof RentalSearchHttpError) {
    return err.status >= 500 || err.status === 429 || err.status === 408;
  }
  // fetch() rejects with a TypeError when the network fails (offline, DNS…); a timeout aborts it.
  // The only code inside the caller's try is fetch() and res.json(), so a TypeError here cannot be
  // an application bug; a malformed body is a SyntaxError and is handled as such above.
  if (err instanceof TypeError) return true;
  const name = (err as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

async function fetchRentalSearch(
  params: RentalSearchApiParams,
): Promise<RentalSearchResponse> {
  const res = await fetch("/api/rentals/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new RentalSearchHttpError(res.status);
  }
  return (await res.json()) as RentalSearchResponse;
}

/** How many messages may wait behind a running search before extra ones go to the concierge. */
const MAX_WAITING_MESSAGES = 10;

export type RentalSearchFastPathOptions = {
  /**
   * Called with a queued message whose replay the rental fast path could not answer (for example
   * the search API rejected it with a 4xx). The caller sends it to the concierge, exactly as it
   * does for any other message the fast path declines.
   */
  onUnhandled?: (text: string) => Promise<boolean> | boolean;
};

export function useRentalSearchFastPath({ onUnhandled }: RentalSearchFastPathOptions = {}) {
  const { state, setState } = useConciergeCoAgent();
  const { clarifyPending, clarifyKind, showExchange, clearLocalMessages } =
    useEventLocalChat();
  const { setToolResult, setSearchMeta } = useRentalFastPath();
  const clearOthers = useClearOtherFastPathResults();
  const { mergePinsByCategory, requestFitBounds } = useMapContext();
  const busyRef = useRef(false);
  // Messages sent while a search is running wait here and are answered one at a time, in the
  // order they were sent, as each search ends — instead of being reported "handled" and dropped.
  const pendingRef = useRef<string[]>([]);
  // The working memory the last successful search wrote. React has not re-rendered yet when a
  // search ends, so `state` is still the pre-search value at that moment; the replay of a queued
  // message starts from this instead, so a refinement keeps the first search's filters.
  const latestMemoryRef = useRef<ConciergeWorkingMemory | null>(null);
  // Bumped when a search ends with a message waiting; the replay effect runs after the next render.
  const [replayTick, setReplayTick] = useState(0);

  const applySearchResults = useCallback(
    (
      cards: Rental[],
      query: ConciergeWorkingMemory["lastRentalQuery"],
      memory: ConciergeWorkingMemory,
      meta?: {
        hybridUsed?: boolean;
        rankExplanation?: Array<{ factor: string; score: number; note: string }>;
        budgetNote?: string;
      },
    ) => {
      clearOthers("rental");
      const envelope = rentalsToToolEnvelope(cards, meta);
      setToolResult(envelope);
      const { pins } = normalizeToolOutput("rental", envelope);
      mergePinsByCategory("rental", pins);
      if (pins.length >= 2) requestFitBounds();
      const nextMemory: ConciergeWorkingMemory = {
        ...memory,
        lastIntent: "rental_search",
        lastRentalQuery: { ...query, genericAskPending: false },
        lastRentalResults: rentalsToPanelRows(cards),
      };
      latestMemoryRef.current = nextMemory;
      setState(nextMemory);
      return pins.length;
    },
    [mergePinsByCategory, requestFitBounds, setState, setToolResult, clearOthers],
  );

  const runSearch = useCallback(
    async (
      userText: string,
      params: RentalSearchApiParams,
      memory: ConciergeWorkingMemory,
    ): Promise<boolean> => {
      if (busyRef.current) return true;
      busyRef.current = true;
      try {
        let response: RentalSearchResponse;
        try {
          response = await fetchRentalSearch(params);
        } catch (err) {
          console.error("[rental-fast-path] search failed", err);
          setToolResult(null);
          setSearchMeta(null);
          // A request problem (4xx) is not an outage and retrying cannot fix it: hand the message
          // to the concierge instead of telling the renter to try again.
          if (!isTemporaryOutage(err)) return false;
          // SAN-407: a real outage is its own answer. Returning false here used to hand the same
          // message to the agent, which then gave a second, conflicting reply. Retrying is just
          // sending the message again; no write happens on this path.
          showExchange(userText, RENTAL_SEARCH_UNAVAILABLE_SUMMARY);
          return true;
        }
        const { results: cards, hybridUsed, rankExplanation, budgetNote } = response;
        const query: ConciergeWorkingMemory["lastRentalQuery"] = {
          neighborhood: params.neighborhood,
          minBedrooms: params.minBedrooms,
          maxPricePerNight: params.maxPricePerNight,
          // Keep the monthly/trip meaning of the budget so a refinement ("Only Laureles") still
          // searches as a monthly stay instead of silently becoming a nightly one.
          budgetType: params.stayType,
          genericAskPending: false,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
        };
        const sig = scoreRentalQuery(userText);
        logRoutingDecision({
          intent: "rental_search",
          slots: buildRentalSlots(sig),
          confidence: sig.confidence,
          action: "search_now",
          source: "fast-path",
          resultCount: cards.length,
          ts: new Date().toISOString(),
        });
        setSearchMeta({ userText, params });
        const pinCount = applySearchResults(cards, query, memory, { hybridUsed, rankExplanation, budgetNote });
        showExchange(
          userText,
          fastPathRentalSummary(cards.length, pinCount, {
            generic:
              !sig.hasNeighborhood && !sig.hasBedrooms && !sig.hasBudget && !sig.hasDateRange &&
              !sig.hasVibeOrUseCase,
            budgetNotApplied: params.maxPricePerNight == null && statesBudget(userText),
          }),
        );
        return true;
      } catch (err) {
        console.error("[rental-fast-path]", err);
        setToolResult(null);
        return false;
      } finally {
        busyRef.current = false;
        // Replay a queued message only after React has re-rendered (see the effect below), never
        // synchronously here: the handler in scope still holds the pre-search state.
        if (pendingRef.current.length > 0) setReplayTick((tick) => tick + 1);
      }
    },
    [applySearchResults, showExchange, setSearchMeta, setToolResult],
  );

  const dispatchMessage = useCallback(
    async (text: string, baseMemory?: ConciergeWorkingMemory | null): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      if (clarifyPending && clarifyKind === "event") return false;
      if (clarifyPending && clarifyKind === "restaurant") return false;

      const memory: ConciergeWorkingMemory = { ...(baseMemory ?? state ?? {}) };

      if (!canFastPathRentalSearch(trimmed, memory)) return false;

      const params = buildRentalSearchParams(trimmed, memory);
      if (!params) return false;

      if (busyRef.current) {
        // A full queue declines the message (false), so the sender routes it to the concierge
        // rather than it being lost.
        if (pendingRef.current.length >= MAX_WAITING_MESSAGES) return false;
        pendingRef.current.push(trimmed);
        return true;
      }

      clearLocalMessages();
      return runSearch(trimmed, params, memory);
    },
    [
      clarifyKind,
      clarifyPending,
      clearLocalMessages,
      runSearch,
      state,
    ],
  );

  const handleUserMessage = useCallback(
    (text: string): Promise<boolean> => dispatchMessage(text),
    [dispatchMessage],
  );

  // Replay the messages that arrived while a search was running, one per search, in order. Each
  // replay runs after the render that follows the previous search, starting from the memory that
  // search wrote. If the fast path cannot answer a message (returns false) it goes to the
  // concierge — it was already reported "handled" to the sender, so dropping it here would leave
  // the renter's message unanswered.
  useEffect(() => {
    if (replayTick === 0 || busyRef.current) return;
    const next = pendingRef.current.shift();
    if (!next) return;
    void (async () => {
      try {
        let handled = false;
        try {
          handled = await dispatchMessage(next, latestMemoryRef.current);
        } catch (err) {
          console.error("[rental-fast-path] replay failed", err);
        }
        if (!handled) await onUnhandled?.(next);
      } catch (err) {
        // The concierge hand-off itself failed. Log it, tell the renter (their message was already
        // acknowledged, so silence would read as "ignored"), and keep draining the queue rather
        // than leaving an unhandled rejection that stalls the messages behind this one.
        console.error("[rental-fast-path] hand-off to the concierge failed", err);
        showExchange(next, RENTAL_HANDOFF_FAILED_SUMMARY);
      } finally {
        // A replay that never reached a search (declined) leaves no search to schedule the next
        // one, so continue the chain here.
        if (pendingRef.current.length > 0 && !busyRef.current) setReplayTick((tick) => tick + 1);
      }
    })();
  }, [replayTick, dispatchMessage, onUnhandled, showExchange]);

  return { handleUserMessage };
}
