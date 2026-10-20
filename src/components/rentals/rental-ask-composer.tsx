"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowUp, MessageSquare, Square } from "lucide-react";
import type { AbstractAgent } from "@copilotkit/react-core/v2";
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
const ERROR_COPY_RUN =
  "MDE could not answer that. Your question is in the conversation — open the full chat to continue.";
const PLACEHOLDER = "Ask about these apartments";
/** Published for the phone Map button, so it clears the composer at any height. */
const HEIGHT_VAR = "--mde-ask-composer-height";

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

/**
 * Copied messages, subscribed, so streaming and in-place mutations reach the transcript.
 * Reading `agent.messages` during render alone would miss both.
 */
function useTurns(agent: AbstractAgent | undefined): PlainTurn[] {
  const [snapshot, setSnapshot] = useState<{ agent: AbstractAgent | undefined; messages: readonly AgentMessage[] }>(
    () => ({ agent, messages: agent ? [...(agent.messages as unknown as AgentMessage[])] : [] }),
  );

  // A different agent (a restored thread) seeds from its own messages. Adjusting state while
  // rendering is the supported React pattern for derived-from-props state.
  if (snapshot.agent !== agent) {
    setSnapshot({
      agent,
      messages: agent ? [...(agent.messages as unknown as AgentMessage[])].slice(-12) : [],
    });
  }

  useEffect(() => {
    if (!agent) return;
    const copy = () =>
      setSnapshot({ agent, messages: [...(agent.messages as unknown as AgentMessage[])].slice(-12) });
    const subscription = agent.subscribe({ onMessagesChanged: copy });
    return () => subscription.unsubscribe();
  }, [agent]);

  return useMemo(() => plainTurns(snapshot.messages), [snapshot.messages]);
}

/** Publish the composer's rendered height so the phone FAB can sit above it, transcript included. */
function usePublishHeight(element: HTMLDivElement | null): void {
  useEffect(() => {
    if (!element) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(HEIGHT_VAR, `${Math.round(element.getBoundingClientRect().height)}px`);
    };
    publish();
    if (typeof ResizeObserver === "undefined") {
      return () => root.style.removeProperty(HEIGHT_VAR);
    }
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, [element]);
}

/** One rule for the pinned surface; `LiveComposer` owns its own element so it can measure it. */
const SHELL_CLASS = "px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6";

function ComposerShell(props: { children: ReactNode; conversation?: ReactNode }) {
  return (
    <div data-testid="rental-ask-composer" className={SHELL_CLASS}>
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

function Transcript({ turns, busy }: { turns: PlainTurn[]; busy: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns]);
  return (
    <ol
      ref={listRef}
      id="rental-ask-transcript"
      data-testid="rental-ask-transcript"
      role="log"
      aria-live="polite"
      aria-busy={busy}
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
  );
}

function ComposerHeader(props: {
  turnCount: number;
  showTranscript: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="text-sm font-medium">Ask MDE</p>
      <div className="flex items-center gap-3">
        {props.turnCount > 0 ? (
          <button
            type="button"
            data-testid="rental-ask-toggle-transcript"
            aria-expanded={props.showTranscript}
            onClick={props.onToggle}
            aria-controls="rental-ask-transcript"
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            {props.showTranscript ? "Hide conversation" : "Show conversation"}
          </button>
        ) : null}
        <Link href="/chat" className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline">
          Open full chat
        </Link>
      </div>
    </div>
  );
}

function SendButton(props: { busy: boolean; canSend: boolean; onSend: () => void; onStop: () => void }) {
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

function ComposerInput(props: {
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

function ComposerError(props: { error: string; canRetry: boolean; onRetry: () => void }) {
  return (
    <div
      id="rental-ask-error"
      role="alert"
      data-testid="rental-ask-error"
      className="mt-2 flex items-center justify-between gap-3 text-sm text-destructive"
    >
      <span>{props.error}</span>
      <button
        type="button"
        data-testid="rental-ask-retry"
        onClick={props.onRetry}
        disabled={!props.canRetry}
        className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
      >
        Try again
      </button>
    </div>
  );
}

function LiveComposer() {
  const { agent, isReady } = useConciergeCoAgent();
  const { appendMessage, isLoading, stopActiveRun } = useConciergeChat();
  const { user, loading: sessionLoading } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [sending, setSending] = useState(false);
  // The agent run status updates asynchronously, so React state alone cannot prevent two rapid sends.
  const sendInFlight = useRef(false);
  const cancelled = useRef(false);

  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  usePublishHeight(shellElement);

  const turns = useTurns(agent);
  const signedOut = !sessionLoading && !user;
  const busy = isLoading || sending;
  const canSend = draft.trim().length > 0 && !busy && !signedOut && isReady;

  const query = searchParams?.toString() ?? "";
  const returnTo = query ? `${pathname}?${query}` : pathname;
  const signInHref = `/login?next=${encodeURIComponent(returnTo)}`;

  const send = useCallback(async () => {
    // The exact text as typed, so a restore only happens when nothing new has been written.
    const raw = draft;
    const text = raw.trim();
    if (!text || busy || signedOut || !isReady || sendInFlight.current) return;
    sendInFlight.current = true;
    cancelled.current = false;
    setSending(true);
    setError(null);
    // Clear on dispatch: the sent question is already on its way, and the box must be free for
    // the next question while this one streams (appending to it would send both together).
    setDraft("");
    const errorVersionBefore = getConciergeErrorVersion();
    try {
      const started = await appendMessage(text);
      // A stopped run must not bring the text back.
      if (cancelled.current) return;
      if (!started) {
        // Nothing was sent: give the words back, unless the user has already typed something else.
        setError(ERROR_COPY);
        setDraft((current) => (current === "" ? raw : current));
        return;
      }
      if (getConciergeErrorVersion() !== errorVersionBefore) {
        // The turn is already in the thread; a Retry here would add the same question twice.
        setError(ERROR_COPY_RUN);
        return;
      }
      setShowTranscript(true);
    } catch {
      if (!cancelled.current) {
        setError(ERROR_COPY);
        setDraft((current) => (current === "" ? raw : current));
      }
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }, [appendMessage, busy, draft, signedOut, isReady]);

  const onStop = useCallback(() => {
    if (sendInFlight.current) cancelled.current = true;
    stopActiveRun();
  }, [stopActiveRun]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter keeps the newline, the same keys the main composer uses.
      if (event.key === "Enter" && !event.shiftKey) {
        // Do not send a half-composed IME candidate.
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        void send();
      }
    },
    [send],
  );

  return (
    <div ref={setShellElement} data-testid="rental-ask-composer" className={SHELL_CLASS}>
      {showTranscript && turns.length > 0 ? <Transcript turns={turns} busy={busy} /> : null}
      <ComposerHeader
        turnCount={turns.length}
        showTranscript={showTranscript}
        onToggle={() => setShowTranscript((open) => !open)}
      />

      {signedOut ? (
        // A visitor should see a deliberate entry point, not a footnote: the row keeps the
        // composer's height and its 44px target, and says exactly what signing in unlocks.
        <div
          data-testid="rental-ask-signed-out"
          className="flex items-center justify-between gap-3"
        >
          <p className="text-sm text-muted-foreground">Ask MDE about these apartments.</p>
          <Link
            href={signInHref}
            className="inline-flex h-11 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <ComposerInput
          draft={draft}
          error={error}
          busy={busy}
          canSend={canSend}
          onDraft={setDraft}
          onKeyDown={onKeyDown}
          onSend={() => void send()}
          onStop={onStop}
        />
      )}

      {!signedOut && !isReady ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Connecting to MDE — you can send when the connection is ready.
        </p>
      ) : null}
      {error ? (
        <ComposerError error={error} canRetry={canSend} onRetry={() => { document.getElementById("rental-ask-input")?.focus(); void send(); }} />
      ) : null}
    </div>
  );
}

export function RentalAskComposer() {
  // Read the context without throwing: previews, isolated tests and deterministic E2E render this
  // page with no chat stack, and must get an inert box instead of an error.
  const coAgent = useOptionalConciergeCoAgent();
  if (isDeterministicE2E() || !coAgent) return <InertComposer />;
  return <LiveComposer />;
}
