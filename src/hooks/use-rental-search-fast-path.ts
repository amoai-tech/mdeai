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
import { budgetNotApplied, scoreRentalQuery } from "@/lib/rental-query-parser";
import {
  RENTAL_HANDOFF_FAILED_SUMMARY,
  RENTAL_SEARCH_UNAVAILABLE_SUMMARY,
  unappliedRentalRequests,
} from "@/lib/rental-display";
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
  total?: number;
  budgetNote?: string;
  hybridUsed?: boolean;
  rankExplanation?: Array<{ factor: string; score: number; note: string }>;
};

/** A non-2xx answer from the search API, with its status so callers can tell 4xx from 5xx. */
class RentalSearchHttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`/api/rentals/search returned ${status} (${code})`);
    this.name = "RentalSearchHttpError";
  }
}

/** Only a bounded error identifier from the canonical API is exposed, never raw response text. */
function sanitizedRentalError(err: unknown): { status: number | null; code: string } {
  if (err instanceof RentalSearchHttpError) return { status: err.status, code: err.code };
  if ((err as { name?: unknown } | null)?.name === "TimeoutError") {
    return { status: null, code: "search_timeout" };
  }
  if ((err as { name?: unknown } | null)?.name === "AbortError") {
    return { status: null, code: "search_aborted" };
  }
  if (err instanceof SyntaxError || (err instanceof Error && err.message === "invalid_rental_search_response")) {
    return { status: null, code: "invalid_response" };
  }
  return { status: null, code: err instanceof TypeError ? "network_error" : "unexpected_error" };
}

/**
 * "Temporarily unavailable" is only true for a network failure, a 5xx, a timeout or a rate limit.
 * A 400/401/403/404 is a request/auth problem, not an outage. A malformed 200
 * response is a code-contract issue, not a temporary network outage. Preserve
 * previous results and keep the existing non-outage fallback contract.
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
    // The API's own maxDuration is 10s. A bounded client wait also covers a stalled
    // connection that never delivers a response, without creating a second search engine.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    let code = "http_error";
    try {
      const body: unknown = await res.json();
      const candidate = (body as { error?: unknown } | null)?.error;
      if (typeof candidate === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(candidate)) {
        code = candidate;
      }
    } catch {
      // HTML, empty and invalid JSON errors are not echoed to the browser log.
    }
    throw new RentalSearchHttpError(res.status, code);
  }
  const body: RentalSearchResponse = await res.json();
  if (!Array.isArray(body?.results)) throw new Error("invalid_rental_search_response");
  return body;
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
  const { clarifyPending, clarifyKind, showExchange, showNotice } =
    useEventLocalChat();
  const { searchMeta, setToolResult, setSearchMeta, reportSearchFailure } = useRentalFastPath();
  const clearOthers = useClearOtherFastPathResults();
  const { mergePinsByCategory, requestFitBounds } = useMapContext();
  const busyRef = useRef(false);
  const runSearchRef = useRef<(
    (userText: string, params: RentalSearchApiParams, memory: ConciergeWorkingMemory, retry: boolean) => Promise<boolean>
  ) | undefined>(undefined);
  // Messages sent while a search is running wait here and are answered one at a time, in the
  // order they were sent, as each search ends — instead of being reported "handled" and dropped.
  const pendingRef = useRef<Array<{ text: string; submissionId?: string }>>([]);
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
        total?: number;
        hybridUsed?: boolean;
        rankExplanation?: Array<{ factor: string; score: number; note: string }>;
        budgetNote?: string;
      },
    ) => {
      // Compute the next consistent view before publishing any card envelope.
      // If normalization/map operations throw, keep the previous genuine cards
      // and their searchMeta/working memory instead of exposing mismatched data.
      const envelope = rentalsToToolEnvelope(cards, meta);
      const { pins } = normalizeToolOutput("rental", envelope);
      const nextMemory: ConciergeWorkingMemory = {
        ...memory,
        lastIntent: "rental_search",
        lastRentalQuery: { ...query, genericAskPending: false },
        lastRentalResults: rentalsToPanelRows(cards),
      };
      clearOthers("rental");
      mergePinsByCategory("rental", pins);
      if (pins.length >= 2) requestFitBounds();
      setState(nextMemory);
      latestMemoryRef.current = nextMemory;
      // Commit the visible cards last; searchMeta is set only after this returns.
      setToolResult(envelope);
      return pins.length;
    },
    [mergePinsByCategory, requestFitBounds, setState, setToolResult, clearOthers],
  );

  const runSearch = useCallback(
    async (
      userText: string,
      params: RentalSearchApiParams,
      memory: ConciergeWorkingMemory,
      submissionId?: string,
      retry = false,
    ): Promise<boolean> => {
      if (busyRef.current) return true;
      busyRef.current = true;
      reportSearchFailure(null);
      // Retry is an assistant-only follow-up to the SAME question. It must not
      // publish/persist a duplicate user bubble with a new submission identity.
      const answer = (message: string, savedSearch?: RentalSearchApiParams) => {
        if (retry) showNotice(message, savedSearch);
        else showExchange(userText, message, submissionId, savedSearch);
      };
      try {
        let response: RentalSearchResponse;
        try {
          response = await fetchRentalSearch(params);
        } catch (err) {
          const { status, code } = sanitizedRentalError(err);
          console.error("[rental-fast-path] /api/rentals/search", { status, code });
          // Authentication failures are not outages: give specific guidance
          // without retrying through another unauthorized agent request.
          // Other invalid requests retain the established Concierge fallback.
          if (err instanceof RentalSearchHttpError && (err.status === 401 || err.status === 403)) {
            answer(
              err.status === 401
                ? "Your session has expired. Sign in again to search rentals."
                : "This account cannot search rentals right now.",
            );
            return true;
          }
          if (!isTemporaryOutage(err)) return false;
          // Keep the last successful result and pins. A retry is a fresh read of
          // the same query, not a synthetic cached search or an invented response.
          reportSearchFailure({ status, code, retryable: true }, () => {
            void runSearchRef.current?.(userText, params, memory, true);
          });
          // No model fallback for a real outage: it might invent a result.
          answer(RENTAL_SEARCH_UNAVAILABLE_SUMMARY);
          return true;
        }
        const { results: cards, total, hybridUsed, rankExplanation, budgetNote } = response;
        const query: ConciergeWorkingMemory["lastRentalQuery"] = {
          neighborhood: params.neighborhood,
          minBedrooms: params.minBedrooms,
          maxPricePerNight: params.maxPricePerNight,
          maxPriceMonthly: params.maxPriceMonthly,
          budgetCurrency: params.budgetCurrency,
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
        const pinCount = applySearchResults(cards, query, memory, { total, hybridUsed, rankExplanation, budgetNote });
        // Metadata must describe the cards actually shown, not a request that
        // may still throw while transforming/rendering the new results.
        setSearchMeta({ userText, params });
        // SAN-1502 follow-up: when a monthly budget was applied, say so. A truthful empty
        // state must not leave the renter guessing whether the 2,000,000 ceiling was used.
        // Never claim a monthly ceiling was applied when the request also carries a nightly cap:
        // that would describe a superseded value instead of the search actually executed.
        const appliedBudget =
          params.maxPriceMonthly != null && params.maxPricePerNight == null
            ? `${params.budgetCurrency ?? "COP"} ${params.maxPriceMonthly.toLocaleString("en-US")} per month`
            : undefined;
        answer(
          fastPathRentalSummary(cards.length, pinCount, {
            generic:
              !sig.hasNeighborhood && !sig.hasBedrooms && !sig.hasBudget && !sig.hasDateRange &&
              !sig.hasVibeOrUseCase,
            budgetNotApplied: budgetNotApplied(userText, params),
            appliedBudget,
            unappliedRequests: unappliedRentalRequests(userText),
          }),
          params,
        );
        return true;
      } catch (err) {
        console.error("[rental-fast-path] unexpected search/render failure", sanitizedRentalError(err));
        // The search API may have returned 200; a transformation/display bug
        // is NOT a network outage. Do not retry the same deterministic bug or
        // replace already-grounded results with a fabricated empty response.
        reportSearchFailure({ status: null, code: "result_processing_error", retryable: false });
        answer("The new rental results could not be displayed. Your earlier results may still be available.");
        return true;
      } finally {
        busyRef.current = false;
        // Replay a queued message only after React has re-rendered (see the effect below), never
        // synchronously here: the handler in scope still holds the pre-search state.
        if (pendingRef.current.length > 0) setReplayTick((tick) => tick + 1);
      }
    },
    [applySearchResults, showExchange, showNotice, setSearchMeta, reportSearchFailure],
  );

  useEffect(() => {
    runSearchRef.current = (text, params, memory, retry) => runSearch(text, params, memory, undefined, retry);
    return () => { runSearchRef.current = undefined; };
  }, [runSearch]);

  const dispatchMessage = useCallback(
    async (text: string, submissionId?: string, baseMemory?: ConciergeWorkingMemory | null): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      if (clarifyPending && clarifyKind === "event") return false;
      if (clarifyPending && clarifyKind === "restaurant") return false;

      const memory: ConciergeWorkingMemory = { ...(baseMemory ?? state ?? {}) };
      // Guest fast-path searches can succeed when the authenticated CoAgent state
      // is unavailable. Reuse the last *visible, thread-local* rental query only
      // while its searchMeta still exists; New Chat and cross-vertical searches
      // clear searchMeta, preventing an older rental from leaking into a new chat.
      if (!memory.lastRentalQuery && searchMeta && latestMemoryRef.current?.lastRentalQuery) {
        memory.lastRentalQuery = latestMemoryRef.current.lastRentalQuery;
      }

      if (!canFastPathRentalSearch(trimmed, memory)) return false;

      const params = buildRentalSearchParams(trimmed, memory);
      if (!params) return false;

      if (busyRef.current) {
        // A full queue declines the message (false), so the sender routes it to the concierge
        // rather than it being lost.
        if (pendingRef.current.length >= MAX_WAITING_MESSAGES) return false;
        pendingRef.current.push({ text: trimmed, submissionId });
        return true;
      }

      // Keep prior exchanges visible while a later search is pending or fails.
      // showExchange already appends and deduplicates by message ID; New Chat
      // still resets through the existing session reset owner.
      return runSearch(trimmed, params, memory, submissionId);
    },
    [
      clarifyKind,
      clarifyPending,
      runSearch,
      searchMeta,
      state,
    ],
  );

  const handleUserMessage = useCallback(
    (text: string, submissionId?: string): Promise<boolean> => dispatchMessage(text, submissionId),
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
          handled = await dispatchMessage(next.text, next.submissionId, latestMemoryRef.current);
        } catch (err) {
          console.error("[rental-fast-path] replay failed", err);
        }
        if (!handled) await onUnhandled?.(next.text);
      } catch (err) {
        // The concierge hand-off itself failed. Log it, tell the renter (their message was already
        // acknowledged, so silence would read as "ignored"), and keep draining the queue rather
        // than leaving an unhandled rejection that stalls the messages behind this one.
        console.error("[rental-fast-path] hand-off to the concierge failed", err);
        showExchange(next.text, RENTAL_HANDOFF_FAILED_SUMMARY, next.submissionId);
      } finally {
        // A replay that never reached a search (declined) leaves no search to schedule the next
        // one, so continue the chain here.
        if (pendingRef.current.length > 0 && !busyRef.current) setReplayTick((tick) => tick + 1);
      }
    })();
  }, [replayTick, dispatchMessage, onUnhandled, showExchange]);

  return { handleUserMessage };
}
