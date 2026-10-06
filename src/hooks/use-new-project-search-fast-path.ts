"use client";

import { useCallback, useRef } from "react";
import { useNewProjectFastPath } from "@/components/chat/new-project-fast-path-context";
import { useClearOtherFastPathResults } from "@/hooks/use-clear-other-fast-path-results";
import {
  buildNewProjectFastPathParams,
  looksLikeNewProjectQuery,
} from "@/lib/new-projects/fast-path";

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
  const busyRef = useRef(false);

  const handleUserMessage = useCallback(
    async (text: string) => {
      if (!looksLikeNewProjectQuery(text)) return false;
      if (busyRef.current) return true;
      busyRef.current = true;
      try {
        const envelope = await fetchNewProjectSearch(buildNewProjectFastPathParams(text));
        clearOthers("new_project");
        setToolResult(envelope);
        return true;
      } catch {
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [clearOthers, setToolResult],
  );

  return { handleUserMessage };
}
