"use client";

import { useEffect } from "react";
import { useSavedThreadHistory } from "@/components/chat/chat-provider";
import { useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { useOptionalThreadNav } from "@/lib/chat/thread-nav-context";
import { useOptionalMapContext } from "@/platform/maps/map-context";
import { rentalsToToolEnvelope } from "@/lib/rental-search-fast-path";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import type { Rental } from "@/mastra/tools/search-rentals";

/**
 * SAN-1639 — restores saved rental cards under the correct providers.
 *
 * The chat history reader is in app/chat/layout.tsx, ABOVE GeoChatShell, so it
 * cannot access RentalFastPathProvider or MapContextProvider. It publishes only
 * owner-checked search criteria. This child re-runs the canonical RLS-governed
 * rental API, ensuring prices and locations are current, never persisted from
 * untrusted frontend data.
 */
export function SavedRentalResultsHydrator() {
  const history = useSavedThreadHistory();
  const nav = useOptionalThreadNav();
  const selectedThreadId = nav?.activeThreadId ?? nav?.sessionThreadId;
  const {
    restoreToolResult, reportRestoreFailure, setSearchMeta,
  } = useRentalFastPath();
  const map = useOptionalMapContext();
  const mergePins = map?.mergePinsByCategory;
  const requestFitBounds = map?.requestFitBounds;
  useEffect(() => {
    const threadId = history.threadId;
    const params = history.lastRentalSearch;
    if (history.status !== "idle" || !threadId || !params || selectedThreadId !== threadId) return;

    const controller = new AbortController();
    const { signal } = controller;
    // React aborts the previous effect on a thread change. Never apply an
    // obsolete request, including after New Chat or Back/Forward navigation.
    const isCurrent = () => !signal.aborted;

    const loadCards = async () => {
      if (signal.aborted) return;
      let status: number | null = null;
      // AbortSignal.any is unavailable on some supported mobile browsers.
      // Per-attempt aborts also keep Retry usable after a timeout.
      const requestController = new AbortController();
      const onAbort = () => requestController.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      const timeout = setTimeout(() => requestController.abort(), 15_000);
      try {
        const response = await fetch("/api/rentals/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: requestController.signal,
        });
        status = response.status;
        if (!response.ok) throw new Error("rental history search unavailable");
        const payload = (await response.json()) as {
          results?: Rental[];
          total?: number;
          hybridUsed?: boolean;
          budgetNote?: string;
          rankExplanation?: Array<{ factor: string; score: number; note: string }>;
        };
        if (!Array.isArray(payload?.results)) throw new Error("invalid saved rental search response");
        const envelope = rentalsToToolEnvelope(payload.results, payload);
        const { pins } = normalizeToolOutput("rental", envelope);
        if (!isCurrent()) return;
        // A newer search that finished after hydration started owns the cards.
        if (!restoreToolResult(envelope)) return;
        setSearchMeta({ userText: params.queryText ?? "", params });
        mergePins?.("rental", pins);
        if (pins.length >= 2) requestFitBounds?.();
      } catch {
        if (!isCurrent()) return;
        reportRestoreFailure({
          status,
          code: "saved_rental_search_unavailable",
          retryable: status == null || status >= 500 || status === 429 || status === 408,
        }, () => { void loadCards(); });
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
      }
    };
    void loadCards();
    return () => controller.abort();
  }, [
    history.status, history.threadId, history.lastRentalSearch, selectedThreadId,
    restoreToolResult, reportRestoreFailure, setSearchMeta, mergePins, requestFitBounds,
  ]);
  return null;
}
