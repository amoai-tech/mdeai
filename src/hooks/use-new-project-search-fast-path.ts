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
      } catch {
        // A superseded request is expected; anything else must not leave stale cards on screen.
        if (controller.signal.aborted) return true;
        clearOthers("new_project");
        setToolResult(null);
        return false;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [clearOthers, setToolResult, showExchange],
  );

  return { handleUserMessage };
}
