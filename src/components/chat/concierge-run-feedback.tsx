"use client";

import { useSyncExternalStore } from "react";
import { ConciergeErrorNotice } from "@/components/chat/concierge-error-notice";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
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
  const { agent } = useOptionalConciergeCoAgent() ?? {};
  const currentThreadId = nav?.activeThreadId ?? nav?.sessionThreadId;
  const error = useSyncExternalStore(
    subscribeConciergeError,
    () => getConciergeErrorForThread(currentThreadId),
    getConciergeErrorForThreadServer,
  );

  // CopilotKit's initial anonymous runtime discovery returns 401 by design.
  // Its provider onError is NOT proof that a chat turn failed; showing Retry
  // before the visitor sent anything implies an imaginary failed answer.
  // Real agent turns have a user message; failed fast paths carry their own
  // explicit retry callback even when no agent message was created.
  const attemptedTurn = agent?.messages.some((message) => message.role === "user") ?? false;
  if (isLoading || error.version === 0 || (!attemptedTurn && !error.retry)) return null;

  return (
    <div data-testid="concierge-run-feedback">
      <ConciergeErrorNotice
        onRetry={() => void (error.retry ?? retryLastTurn)()}
      />
    </div>
  );
}
