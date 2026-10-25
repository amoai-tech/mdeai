"use client";

import { useSyncExternalStore } from "react";
import { ConciergeErrorNotice } from "@/components/chat/concierge-error-notice";
import {
  getConciergeErrorForThread,
  getConciergeErrorForThreadServer,
  subscribeConciergeError,
} from "@/lib/concierge-error-store";
import { useOptionalThreadNav } from "@/lib/chat/thread-nav-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";

/**
 * Stop belongs at the end of the transcript, immediately above the composer, where the thumb
 * already is. It must not move to the top of the panel with the error notice.
 */
export function ConciergeStopButton() {
  const { isLoading, stopActiveRun } = useConciergeChat();
  if (!isLoading) return null;
  return (
    <button
      type="button"
      data-testid="concierge-stop"
      aria-label="Stop"
      onClick={stopActiveRun}
      className="self-start rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      Stop
    </button>
  );
}

/**
 * The error half stays outside the transcript so an empty-thread failure still offers Retry.
 * It is mounted inside the polite chat region and the notice also carries role="alert".
 */
export function ConciergeErrorFeedback() {
  const { isLoading, retryLastTurn } = useConciergeChat();
  const nav = useOptionalThreadNav();
  const currentThreadId = nav?.activeThreadId ?? nav?.sessionThreadId;
  const error = useSyncExternalStore(
    subscribeConciergeError,
    () => getConciergeErrorForThread(currentThreadId),
    getConciergeErrorForThreadServer,
  );

  if (isLoading || error.version === 0) return null;

  return (
    <div data-testid="concierge-run-feedback">
      <ConciergeErrorNotice
        onRetry={() => void (error.retry ?? retryLastTurn)()}
      />
    </div>
  );
}
