"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ConciergeErrorNotice } from "@/components/chat/concierge-error-notice";
import {
  clearConciergeError,
  getConciergeErrorSnapshot,
  getConciergeErrorSnapshotServer,
  subscribeConciergeError,
} from "@/lib/concierge-error-store";
import { useOptionalThreadNav } from "@/lib/chat/thread-nav-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";

/** Visible Stop while a turn runs, and Retry after an agent failure. */
export function ConciergeRunFeedback() {
  const error = useSyncExternalStore(
    subscribeConciergeError,
    getConciergeErrorSnapshot,
    getConciergeErrorSnapshotServer,
  );
  const { isLoading, retryLastTurn, stopActiveRun } = useConciergeChat();
  const nav = useOptionalThreadNav();
  const currentThreadId = nav?.activeThreadId ?? nav?.sessionThreadId;
  const stale = Boolean(
    error.version > 0 &&
    error.threadId &&
    currentThreadId &&
    error.threadId !== currentThreadId,
  );

  // A failure from an old chat must not offer Retry in the new chat.
  // Re-read the store first: a newer error from the current thread may have
  // replaced the stale one between render and this effect.
  useEffect(() => {
    if (!stale) return;
    const current = getConciergeErrorSnapshot();
    if (current.threadId && current.threadId !== currentThreadId) {
      clearConciergeError(current.threadId);
    }
  }, [stale, currentThreadId]);

  if (!isLoading && (error.version === 0 || stale)) return null;

  return (
    <div data-testid="concierge-run-feedback" className="flex flex-col gap-2">
      {isLoading ? (
        <button
          type="button"
          data-testid="concierge-stop"
          aria-label="Stop"
          onClick={stopActiveRun}
          className="self-start rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Stop
        </button>
      ) : null}
      {error.version > 0 && !isLoading && !stale ? (
        <ConciergeErrorNotice
          onRetry={() => void retryLastTurn()}
        />
      ) : null}
    </div>
  );
}
