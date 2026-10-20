"use client";

import { useSyncExternalStore } from "react";
import { ConciergeErrorNotice } from "@/components/chat/concierge-error-notice";
import {
  getConciergeErrorVersion,
  getConciergeErrorVersionServer,
  subscribeConciergeError,
} from "@/lib/concierge-error-store";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";

/** Visible Stop while a turn runs, and Retry after an agent failure. */
export function ConciergeRunFeedback() {
  const errorVersion = useSyncExternalStore(
    subscribeConciergeError,
    getConciergeErrorVersion,
    getConciergeErrorVersionServer,
  );
  const { isLoading, retryLastTurn, stopActiveRun } = useConciergeChat();

  if (!isLoading && errorVersion === 0) return null;

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
      {errorVersion > 0 && !isLoading ? (
        <ConciergeErrorNotice onRetry={() => void retryLastTurn()} />
      ) : null}
    </div>
  );
}
