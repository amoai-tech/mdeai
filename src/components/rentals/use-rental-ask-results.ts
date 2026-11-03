"use client";

import { useCallback, useMemo, useState } from "react";
import type { RentalAskResults } from "@/components/rentals/rental-ask-composer";
import {
  clearStoredAskResults,
  readStoredAskResults,
  writeStoredAskResults,
} from "@/lib/rentals/ask-results-storage";

/** The visible Ask MDE result must belong to BOTH the active thread and URL filters. */
export function useRentalAskResults(threadId: string | undefined, signature: string) {
  const scope = JSON.stringify([threadId ?? null, signature]);
  const [live, setLive] = useState<{ scope: string; payload: RentalAskResults } | null>(null);
  const [clearedScope, setClearedScope] = useState<string | null>(null);
  const asked = live?.scope === scope ? live.payload : null;
  const restored = useMemo(
    () => (asked || clearedScope === scope ? null : readStoredAskResults(threadId, signature)),
    [asked, clearedScope, scope, threadId, signature],
  );

  const acceptResults = useCallback((payload: RentalAskResults) => {
    // Only a NEW tool result may be written. Never re-tag old/restored rows when
    // changing filters or switching saved conversations.
    writeStoredAskResults(threadId, signature, payload);
    setLive({ scope, payload });
    setClearedScope(null);
  }, [threadId, signature, scope]);

  const clearResults = useCallback(() => {
    clearStoredAskResults(threadId);
    setLive(null);
    setClearedScope(scope);
  }, [threadId, scope]);

  return { activeAsk: asked ?? restored, acceptResults, clearResults };
}
