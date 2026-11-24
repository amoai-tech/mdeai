"use client";

import Link from "next/link";
import { ArrowUp, Square } from "lucide-react";
import { type KeyboardEvent, type ReactNode } from "react";
import { SelectedItemClearAction } from "@/components/chat/selected-item-clear-action";

const PLACEHOLDER = "Ask about these apartments";

/** Presentational pieces of the Ask MDE box. State and sending live in the composer. */

/** One rule for the pinned surface; `LiveComposer` owns its own element so it can measure it. */
export const SHELL_CLASS = "px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6";

export function ComposerShell(props: { children: ReactNode }) {
  return (
    <div data-testid="rental-ask-composer" className={SHELL_CLASS}>
      {props.children}
    </div>
  );
}

/** Deterministic browser tests run without CopilotKit transport, so the hooks cannot mount there. */
export function InertComposer() {
  return (
    <ComposerShell>
      <p className="mb-2 text-sm font-medium">Ask MDE</p>
      <div className="flex items-end gap-2">
        <div
          className="min-h-11 flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground"
          data-testid="rental-ask-inert"
        >
          {PLACEHOLDER}
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ArrowUp className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </ComposerShell>
  );
}

export function ComposerHeader(props: {
  hasSelectedListing?: boolean;
  onClearSelection?: () => void;
}) {
  return (
    <>
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="text-sm font-medium">Ask MDE</p>
      <div className="flex items-center gap-3">
        <Link href="/chat" className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline">
          Open full chat
        </Link>
      </div>
    </div>
    {props.hasSelectedListing ? (
      <SelectedItemClearAction
        label="Apartment selected"
        onClear={props.onClearSelection}
        testId="rental-ask-clear-selection"
      />
    ) : null}
    </>
  );
}

export function SendButton(props: { busy: boolean; canSend: boolean; onSend: () => void; onStop: () => void }) {
  if (props.busy) {
    return (
      <button
        type="button"
        data-testid="rental-ask-stop"
        onClick={props.onStop}
        aria-label="Stop the answer"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
      >
        <Square className="h-4 w-4" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="rental-ask-send"
      onClick={props.onSend}
      disabled={!props.canSend}
      aria-label="Ask MDE"
      className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
    >
      <ArrowUp className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function ComposerInput(props: {
  draft: string;
  error: string | null;
  busy: boolean;
  canSend: boolean;
  onDraft: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <label htmlFor="rental-ask-input" className="sr-only">
        Ask MDE about rentals
      </label>
      <textarea
        id="rental-ask-input"
        rows={1}
        value={props.draft}
        onChange={(event) => props.onDraft(event.target.value)}
        onKeyDown={props.onKeyDown}
        placeholder={PLACEHOLDER}
        aria-describedby={props.error ? "rental-ask-error" : undefined}
        className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
      />
      <SendButton busy={props.busy} canSend={props.canSend} onSend={props.onSend} onStop={props.onStop} />
    </div>
  );
}

export function ComposerError(props: { error: string; canRetry: boolean; retryable: boolean; onRetry: () => void }) {
  return (
    <div
      id="rental-ask-error"
      role="alert"
      data-testid="rental-ask-error"
      className="mt-2 flex items-center justify-between gap-3 text-sm text-destructive"
    >
      <span>{props.error}</span>
      {props.retryable ? (
        <button
          type="button"
          data-testid="rental-ask-retry"
          onClick={props.onRetry}
          disabled={!props.canRetry}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

