"use client";

import { useCallback, useRef } from "react";
import { sendConciergeUserMessage, type ConciergeSendHandlers } from "@/lib/concierge-send-user-message";

/**
 * One UI action gets one submission identity, including overlapping callback
 * replays. The shared send pipeline also preserves this ID for its error retry.
 * A later intentional identical question gets a fresh identity.
 */
export function useConciergeSubmitHandler(handlers: ConciergeSendHandlers): (text: string) => void {
  const pendingRef = useRef(new Map<string, Promise<boolean>>());

  return useCallback((text: string) => {
    const question = text.trim();
    if (!question || pendingRef.current.has(question)) return;

    const id = crypto.randomUUID();
    const pending = sendConciergeUserMessage(question, handlers, id);
    pendingRef.current.set(question, pending);
    void pending.finally(() => {
      if (pendingRef.current.get(question) === pending) pendingRef.current.delete(question);
    }).catch(() => undefined);
  }, [handlers]);
}
