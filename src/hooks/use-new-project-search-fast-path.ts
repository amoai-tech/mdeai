"use client";

import { useCallback, useRef } from "react";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { useNewProjectFastPath } from "@/components/chat/new-project-fast-path-context";
import { useClearOtherFastPathResults } from "@/hooks/use-clear-other-fast-path-results";
import {
  buildNewProjectFastPathParams,
  looksLikeNewProjectQuery,
} from "@/lib/new-projects/fast-path";
import {
  newProjectSearchEnvelopeSchema,
  type NewProjectSearchEnvelope,
} from "@/lib/new-projects/search-envelope";

/** A short assistant line for the local transcript; the cards carry the detail. */
function newProjectSearchSummary(envelope: NewProjectSearchEnvelope): string {
  const count = envelope.results.length;
  if (count === 0) return "No published projects matched those filters.";
  return "Found " + count + " new project" + (count === 1 ? "" : "s") + ".";
}

async function fetchNewProjectSearch(
  params: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch("/api/new-projects/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) throw new Error("new-project search failed: " + res.status);
  return res.json();
}

/** Deterministic New Projects fast path: classify, call the read-only API, render grounded cards. */
export function useNewProjectSearchFastPath() {
  const { setToolResult } = useNewProjectFastPath();
  const clearOthers = useClearOtherFastPathResults();
  const { showExchange } = useEventLocalChat();
  const controllerRef = useRef<AbortController | null>(null);

  const handleUserMessage = useCallback(
    async (text: string) => {
      if (!looksLikeNewProjectQuery(text)) return false;
      // Latest search wins: cancel the in-flight request instead of dropping this one.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      // The previous cards belong to the previous request, not this search.
      clearOthers("new_project");
      setToolResult(null);
      try {
        const raw = await fetchNewProjectSearch(
          buildNewProjectFastPathParams(text),
          controller.signal,
        );
        if (controller.signal.aborted) return true;
        const parsed = newProjectSearchEnvelopeSchema.safeParse(raw);
        if (!parsed.success) throw new Error("invalid new-project search envelope");
        clearOthers("new_project");
        setToolResult(parsed.data);
        showExchange(text, newProjectSearchSummary(parsed.data));
        return true;
      } catch (error) {
        // A superseded search is owned by the newer request: no stale result and no agent retry.
        if (controller.signal.aborted) return true;
        setToolResult(null);
        const message =
          error instanceof Error && /^(New Projects search supports|New Projects currently covers|I couldn't interpret that price)/.test(error.message)
            ? error.message
            : "I couldn't search new projects right now. Please try again.";
        showExchange(text, message);
        // The error has a visible local answer; returning false would duplicate the request
        // through the AI tool (and could produce another misleading set of cards).
        return true;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [clearOthers, setToolResult, showExchange],
  );

  return { handleUserMessage };
}
