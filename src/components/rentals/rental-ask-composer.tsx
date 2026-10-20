"use client";

import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUp, MessageSquare, Square } from "lucide-react";
import {
  useConciergeCoAgent,
  useOptionalConciergeCoAgent,
} from "@/components/chat/concierge-coagent-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import { useSession } from "@/hooks/use-session";
import { getConciergeErrorVersion } from "@/lib/concierge-error-store";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

/**
 * SAN-1421 — "Ask MDE" inside the results column.
 *
 * This is not a second chat. It sends on the page's existing concierge thread (the app-wide
 * `DiscoveryConciergeProvider` already owns the thread and replays saved history), so a question asked
 * here is the same conversation the user finds on /chat, with the same answer and the same saved state.
 *
 * It shows plain-text turns only. Rich rental cards and the map stay where they already render for the
 * thread, instead of growing a second card renderer inside the browse column.
 */

const TRANSCRIPT_LIMIT = 6;
const ERROR_COPY = "MDE could not answer that. Your question is still here — try again.";
const PLACEHOLDER = "Ask about these apartments";

type PlainTurn = { id: string; role: "user" | "assistant"; text: string };
type AgentMessage = { id?: string; role?: string; content?: unknown };

/** Keep only turns that have text, so tool/state-only messages do not leave blank rows. */
function plainTurns(messages: readonly AgentMessage[]): PlainTurn[] {
  const turns: PlainTurn[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return;
    if (typeof message.content !== "string") return;
    const text = message.content.trim();
    if (!text) return;
    turns.push({ id: message.id ?? `${message.role}-${index}`, role: message.role, text });
  });
  return turns.slice(-TRANSCRIPT_LIMIT);
}

function ComposerShell(props: { children: ReactNode; conversation?: ReactNode }) {
  return (
    <div
      data-testid="rental-ask-composer"
      className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6"
    >
      {props.conversation}
      {props.children}
    </div>
  );
}

/** Deterministic browser tests run without CopilotKit transport, so the hooks cannot mount there. */
function InertComposer() {
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

function LiveComposer() {
  const { agent } = useConciergeCoAgent();
  const { appendMessage, isLoading, stopActiveRun } = useConciergeChat();
  const { user, loading: sessionLoading } = useSession();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const turns = useMemo(() => plainTurns(agent?.messages ?? []), [agent?.messages]);
  const signedOut = !sessionLoading && !user;
  const busy = isLoading;
  const canSend = draft.trim().length > 0 && !busy && !signedOut;

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy || signedOut) return;
    setError(null);
    setDraft("");
    const errorVersionBefore = getConciergeErrorVersion();
    try {
      const started = await appendMessage(text);
      if (!started || getConciergeErrorVersion() !== errorVersionBefore) {
        setError(ERROR_COPY);
        setDraft(text);
        return;
      }
      setShowTranscript(true);
    } catch {
      setError(ERROR_COPY);
      setDraft(text);
    }
  }, [appendMessage, busy, draft, signedOut]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter keeps the newline, the same keys the main composer uses.
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void send();
      }
    },
    [send],
  );

  const conversation = showTranscript && turns.length > 0 ? (
    <ol
      data-testid="rental-ask-transcript"
      className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3"
    >
      {turns.map((turn) => (
        <li key={turn.id} className="text-sm">
          <span className="mr-2 text-xs font-medium text-muted-foreground">
            {turn.role === "user" ? "You" : "MDE"}
          </span>
          <span className={turn.role === "assistant" ? "text-foreground" : "text-muted-foreground"}>
            {turn.text}
          </span>
        </li>
      ))}
    </ol>
  ) : null;

  return (
    <ComposerShell conversation={conversation}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Ask MDE</p>
        <div className="flex items-center gap-3">
          {turns.length > 0 ? (
            <button
              type="button"
              data-testid="rental-ask-toggle-transcript"
              aria-expanded={showTranscript}
              onClick={() => setShowTranscript((open) => !open)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              {showTranscript ? "Hide conversation" : "Show conversation"}
            </button>
          ) : null}
          <Link href="/chat" className="text-xs font-medium text-primary hover:underline">
            Open full chat
          </Link>
        </div>
      </div>

      {signedOut ? (
        <p className="text-sm text-muted-foreground" data-testid="rental-ask-signed-out">
          <Link href="/login?next=%2Frentals" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to ask MDE about these apartments.
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <label htmlFor="rental-ask-input" className="sr-only">
            Ask MDE about rentals
          </label>
          <textarea
            id="rental-ask-input"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDER}
            aria-describedby={error ? "rental-ask-error" : undefined}
            className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {busy ? (
            <button
              type="button"
              data-testid="rental-ask-stop"
              onClick={() => stopActiveRun()}
              aria-label="Stop the answer"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
            >
              <Square className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              data-testid="rental-ask-send"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Ask MDE"
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      )}

      {error ? (
        <div
          id="rental-ask-error"
          role="alert"
          data-testid="rental-ask-error"
          className="mt-2 flex items-center justify-between gap-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <button
            type="button"
            data-testid="rental-ask-retry"
            onClick={() => void send()}
            disabled={busy || !draft.trim()}
            className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
          >
            Try again
          </button>
        </div>
      ) : null}
    </ComposerShell>
  );
}

export function RentalAskComposer() {
  // Read the context without throwing: previews, isolated tests and deterministic E2E render this
  // page with no chat stack, and must get an inert box instead of an error.
  const coAgent = useOptionalConciergeCoAgent();
  if (isDeterministicE2E() || !coAgent) return <InertComposer />;
  return <LiveComposer />;
}
