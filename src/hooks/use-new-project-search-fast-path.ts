"use client";

import { useCallback, useRef } from "react";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { useNewProjectFastPath } from "@/components/chat/new-project-fast-path-context";
import { useClearOtherFastPathResults } from "@/hooks/use-clear-other-fast-path-results";
import {
  buildNewProjectFastPathParams,
  looksLikeNewProjectQuery,
} from "@/lib/new-projects/fast-path";

/** A short assistant line for the local transcript; the cards carry the detail. */
function newProjectSearchSummary(envelope: unknown): string {
  const results = (envelope as { results?: unknown[] } | null)?.results;
  const count = Array.isArray(results) ? results.length : 0;
  if (count === 0) return "No published projects matched those filters.";
  return "Found " + count + " new project" + (count === 1 ? "" : "s") + ".";
}

async function fetchNewProjectSearch(params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/new-projects/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("new-project search failed: " + res.status);
  return res.json();
}

/** Deterministic New Projects fast path: classify, call the read-only API, render grounded cards. */
export function useNewProjectSearchFastPath() {
  const { setToolResult } = useNewProjectFastPath();
  const clearOthers = useClearOtherFastPathResults();
  const { showExchange } = useEventLocalChat();
  const busyRef = useRef(false);

  const handleUserMessage = useCallback(
    async (text: string) => {
      if (!looksLikeNewProjectQuery(text)) return false;
      if (busyRef.current) {
        // A second send while a search is in flight must not vanish: record the question, skip
        // the duplicate search, and still report the send as handled.
        showExchange(text, "");
        return true;
      }
      busyRef.current = true;
      try {
        const envelope = await fetchNewProjectSearch(buildNewProjectFastPathParams(text));
        clearOthers("new_project");
        setToolResult(envelope);
        showExchange(text, newProjectSearchSummary(envelope));
        return true;
      } catch {
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [clearOthers, setToolResult, showExchange],
  );

  return { handleUserMessage };
}
