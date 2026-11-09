"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { useOptionalConciergeCoAgent, useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import { getConciergeErrorForThread, getConciergeErrorVersion } from "@/lib/concierge-error-store";
import { useTurns } from "@/components/rentals/rental-ask-tool-results";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";
import { ArrowUp, Square } from "lucide-react";
import type { DiscoveryPage } from "@/components/chat/discovery-page-context";
import { getLatestDiscoveryToolResult, type DiscoveryAgentResult } from "./discovery-tool-results";
import { SelectedItemClearAction } from "./selected-item-clear-action";

type EventGuestOptions = {
  category?: "music" | "food" | "culture" | "sport" | "nightlife" | null;
  neighborhood?: string | null;
  dateWindow?: "tonight" | "this_weekend" | "this_week" | "next_week" | "any" | null;
  onEventIds: (ids: string[]) => void;
};

/** Guest venue search reuses the public catalog endpoint; protected chat stays protected. */
import { GuestRestaurantSearch, type RestaurantGuestOptions } from "@/components/chat/guest-restaurant-search";
import { GuestVenueSearchScoped, type VenueGuestOptions } from "@/components/chat/guest-venue-search";

/** The existing public, rate-limited events endpoint works for guests; protected chat stays protected. */
function GuestEventComposer({ options }: { options: EventGuestOptions }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const send = async () => {
    const q = question.trim();
    if (!q || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/events/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ queryText: q, limit: 20,
          ...(options.category ? { category: options.category } : {}),
          ...(options.neighborhood ? { neighborhood: options.neighborhood } : {}),
          ...(options.dateWindow ? { dateWindow: options.dateWindow } : {}),
        }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many searches. Try again shortly." : "Event search is unavailable. Please retry.");
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || !("results" in json) || !Array.isArray(json.results)) throw new Error("Invalid event search response. Please retry.");
      // Use only IDs; the server-rendered public catalog owns prices, actions and provenance.
      const ids = json.results.map((r: unknown) => r && typeof r === "object" && "id" in r ? r.id : null)
        .filter((id: unknown): id is string => typeof id === "string" && /^[a-f\d-]{36}$/i.test(id));
      options.onEventIds(ids); setLastQuestion(q); setQuestion("");
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Event search failed.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div data-testid="guest-event-ask" className="space-y-2">
    <p className="text-sm text-muted-foreground">Search published events without signing in. Sign in for saved AI conversations.</p>
    {lastQuestion ? <p data-testid="guest-event-query" className="text-xs text-muted-foreground">Showing matches in this catalog for: {lastQuestion}</p> : null}
    <div className="flex items-end gap-2">
      <label htmlFor="guest-event-question" className="sr-only">Search events</label>
      <textarea id="guest-event-question" rows={1} value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-base" placeholder="Find music events this weekend" onKeyDown={(e) => { if(e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
      <button type="button" data-testid="guest-event-send" className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40" disabled={!question.trim() || busy} onClick={send} aria-label="Search events"><ArrowUp className="size-4" /></button>
    </div>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>;
}

/**
 * Questions an event detail visitor actually has before buying. They are prompts only:
 * a click sends one real turn through this composer, and the existing concierge answers
 * it from the selected event. Nothing here claims an answer or starts a run on mount.
 */
export const EVENT_DETAIL_ASK_SUGGESTIONS = [
  "Are tickets available?",
  "Where is the meeting point?",
  "When does it start?",
] as const;

const INTERRUPTED_COPY = "The response was interrupted. Check the conversation before retrying.";

/** Did THIS conversation report a failure after `before`? Another chat's error must not count. */
const runFailedSince = (threadId: string | undefined, before: number) =>
  getConciergeErrorForThread(threadId).version > before || getConciergeErrorForThread(null).version > before;

/** Starter questions: one real turn per click, using the same path as a typed question. */
// skipcq: JS-0067 - module-local React component; not browser global scope
function AskSuggestions({ questions, onPick }: { questions: readonly string[]; onPick: (question: string) => void }) {
  return (
    <div role="group" aria-label="Suggested questions" data-testid="discovery-ask-suggestions" className="mb-2 flex flex-wrap gap-2">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          data-testid="discovery-ask-suggestion"
          onClick={() => onPick(question)}
          // min-h-11 is the 44px touch target the rest of this composer uses.
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

/** The compact transcript: follow the newest answer unless the visitor scrolls up to read. */
function AskHistory({ turns, open }: { turns: Array<{ id: string; role: string; text: string }>; open: boolean }) {
  const historyRef = useRef<HTMLOListElement>(null);
  const followLatestRef = useRef(true);
  useLayoutEffect(() => {
    // Reopening a hidden transcript should reveal the newest reply again.
    if (!open) {
      followLatestRef.current = true;
      return;
    }
    const history = historyRef.current;
    if (history && followLatestRef.current) history.scrollTop = history.scrollHeight;
  }, [open, turns]);
  if (!open || turns.length === 0) return null;
  return (
    <ol ref={historyRef} data-testid="discovery-ask-history" role="log" aria-live="polite"
      onScroll={(event) => {
        const el = event.currentTarget;
        followLatestRef.current = el.scrollHeight - el.clientHeight - el.scrollTop <= 28;
      }}
      className="mb-2 max-h-52 space-y-2 overflow-auto rounded-lg border p-3">
      {turns.map((t) => <li key={t.id} className="min-w-0 text-sm">
        <span className="mr-2 text-xs font-medium text-muted-foreground">{t.role === "user" ? "You" : "MDE"}:</span>
        {t.role === "assistant" ? (
          <div className="min-w-0 break-words [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_a]:text-primary [&_a]:underline [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_th]:p-1 [&_td]:p-1">
            <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
          </div>
        ) : <span className="whitespace-pre-wrap break-words">{t.text}</span>}
      </li>)}
    </ol>
  );
}

/** Nothing to do with a rejection that runTurn already surfaced to the visitor. */
const ignoreRejection = () => undefined;

/** One composer on every non-rental browse page; Rentals retains its richer search adapter. */
// skipcq: JS-0067 - module-local React component; not browser global scope
function LiveComposer({ page, guestEvents, guestRestaurants, guestVenues, onAgentResults, hideHeading = false, suggestions, historyNote, hasSelectedItem, onClearSelection }: {
  page: Exclude<DiscoveryPage, "rentals">;
  guestEvents?: EventGuestOptions;
  /** Restaurants only: catalog search for signed-out visitors, using the public endpoint. */
  guestRestaurants?: RestaurantGuestOptions;
  /** Cafés and nightlife: venue-anchor search for signed-out visitors. */
  guestVenues?: VenueGuestOptions;
  onAgentResults?: (result: DiscoveryAgentResult) => void;
  /** The shared drawer supplies its own title and full-chat link. */
  hideHeading?: boolean;
  /** Optional starter questions; a click sends one normal turn, never a canned answer. */
  suggestions?: readonly string[];
  /** Label restored turns from earlier events without clearing the shared thread. */
  historyNote?: string;
  /** The page owns this selected place and its clear handler. */
  hasSelectedItem?: boolean;
  onClearSelection?: () => void;
}) {
  const { user, loading: sessionLoading } = useSession();
  const { agent, isReady } = useConciergeCoAgent();
  const { appendMessage, stopActiveRun, retryLastTurn, isLoading, isRuntimeUnavailable } = useConciergeChat();
  const turns = useTurns(agent);
  const path = usePathname();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A restored agent/thread may already have streamed a reply before this
  // composer remounts. Keep that answer visible by default; users can still
  // explicitly collapse the conversation with the existing toggle.
  const [showHistory, setShowHistory] = useState(true);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  // A run's tool result may arrive in a separate agent update from its final text.
  // Retain the submitting page/filter callback rather than re-scoping old results
  // to filters changed while an answer is streaming.
  const pendingResult = useRef<{ since: number; errorVersion: number; emit: (result: DiscoveryAgentResult) => void } | null>(null);
  useEffect(() => {
    if (!agent) return;
    const publishCompletedResult = () => {
      const pending = pendingResult.current;
      if (!pending || agent.isRunning || cancelled.current) return;
      // A failed run must not replace the browse cards with its partial results.
      if (runFailedSince(agent.threadId, pending.errorVersion)) return;
      const result = getLatestDiscoveryToolResult(agent.messages, page, pending.since);
      if (!result) return;
      pendingResult.current = null; // exactly once, regardless of subsequent message updates
      pending.emit(result);
    };
    const subscription = agent.subscribe({
      onMessagesChanged: publishCompletedResult,
      onRunFinalized: publishCompletedResult,
    });
    return () => {
      pendingResult.current = null; // never deliver an old page's results after navigation
      subscription.unsubscribe();
    };
  }, [agent, page]);
  const signedOut = !sessionLoading && !user;
  const busy = sending || isLoading;
  const starters = suggestions ?? [];
  // Starter questions are only shown when a click can really send: guests keep the
  // existing sign-in state, and an in-flight or not-yet-ready composer offers none.
  const showSuggestions = starters.length > 0 && !signedOut && !busy && isReady;
  /**
   * One send path for typed questions and starter questions. `origin` only decides
   * whether the visible draft is consumed/restored; the agent call is identical, so a
   * clicked question is a real user turn and never a local shortcut.
   */
  const runTurn = useCallback(async (raw: string, origin: "composer" | "suggestion") => {
    const message = raw.trim();
    if (!message || inFlight.current || busy || !isReady || signedOut || isRuntimeUnavailable()) return;
    inFlight.current = true;
    cancelled.current = false;
    setSending(true);
    setError(null);
    if (origin === "composer") setDraft("");
    const startIndex = agent?.messages.length ?? 0;
    const errorVersionBefore = getConciergeErrorVersion();
    pendingResult.current = onAgentResults ? { since: startIndex, errorVersion: errorVersionBefore, emit: onAgentResults } : null;
    try {
      const saved = await appendMessage(message);
      if (!saved && !cancelled.current) {
        setError("MDE could not send your question. Please try again.");
        // A typed draft is the visitor's text, so give it back; a suggestion is one shot.
        if (origin === "composer") setDraft((current) => current || message);
      } else if (!cancelled.current && runFailedSince(agent?.threadId, errorVersionBefore)) {
        // CopilotKit reports a failed stream through the error store and still resolves runAgent.
        // The question is already in the thread, so say so instead of showing nothing.
        pendingResult.current = null;
        setError(INTERRUPTED_COPY);
        setShowHistory(true);
      } else if (!cancelled.current) {
        // Catch the case where runAgent resolved after the last subscription event.
        const pending = pendingResult.current;
        if (pending && agent) {
          const result = getLatestDiscoveryToolResult(agent.messages, page, pending.since);
          if (result) {
            pendingResult.current = null;
            pending.emit(result);
          }
        }
        setShowHistory(true);
      }
    } catch {
      // The turn may already have been committed to the thread. Never blindly append it again.
      if (!cancelled.current) setError(INTERRUPTED_COPY);
    } finally {
      pendingResult.current = null;
      inFlight.current = false;
      setSending(false);
    }
  }, [agent, appendMessage, busy, isReady, isRuntimeUnavailable, onAgentResults, page, signedOut]);
  // Sending a starter question and typing a question use the same guarded turn path.
  const send = useCallback(() => { runTurn(draft, "composer").catch(ignoreRejection); }, [draft, runTurn]);
  // PR #695: retry the existing user turn rather than appending it a second time.
  // The chat controller enforces one retry per agent and the current thread ID.
  const retry = async () => {
    if (!agent?.messages.some((message) => message.role === "user") ||
        busy || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const ok = await retryLastTurn();
      if (!ok) setError(INTERRUPTED_COPY);
      setShowHistory(true);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };
  return (
    <section data-ready={isReady ? "true" : "false"} aria-busy={busy} data-testid={`discovery-ask-${page}`} aria-label={`Ask MDE about ${page}`} className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      {hideHeading ? null : (
      <div className="mb-2 flex items-center justify-between gap-3">
        <strong className="text-sm">Ask MDE</strong>
        <div className="flex items-center gap-3 text-xs">
          {turns.length > 0 ? <button type="button" className="min-h-11 text-muted-foreground" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} data-testid="discovery-ask-history-toggle">{showHistory ? "Hide" : "Show"} conversation</button> : null}
          <Link href="/chat" className="inline-flex min-h-11 items-center text-primary">Open full chat</Link>
        </div>
      </div>
      )}
      {hasSelectedItem ? (
        <SelectedItemClearAction
          label="Place selected"
          onClear={onClearSelection}
          testId="discovery-ask-clear-selection"
        />
      ) : null}
      {historyNote && turns.length > 0 ? (
        <p role="note" data-testid="discovery-ask-history-context" className="mb-2 text-xs text-muted-foreground">
          {historyNote}
        </p>
      ) : null}
      <AskHistory turns={turns} open={showHistory} />
      {showSuggestions ? (
        <AskSuggestions
          questions={starters}
          onPick={(question) => { runTurn(question, "suggestion").catch(ignoreRejection); }}
        />
      ) : null}
      {signedOut && page === "restaurants" && guestRestaurants ? (
        <GuestRestaurantSearch options={guestRestaurants} />
      ) : signedOut && (page === "cafes" || page === "nightlife") && guestVenues ? (
        <GuestVenueSearchScoped options={guestVenues} />
      ) : signedOut && page === "events" && guestEvents ? <GuestEventComposer options={guestEvents} /> : signedOut ? (
        <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Sign in to ask about {page}.</p><Link className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg bg-primary px-4 text-sm text-primary-foreground" href={`/login?next=${encodeURIComponent(path)}`}>Sign in</Link></div>
      ) : (
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`discovery-ask-input-${page}`}>Ask MDE about {page}</label>
          <textarea id={`discovery-ask-input-${page}`} data-testid="discovery-ask-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} rows={1} placeholder={`Ask about ${page}…`} className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-base focus-visible:ring-2 focus-visible:ring-ring sm:text-sm" />
          {busy ? <button type="button" data-testid="discovery-ask-stop" className="flex size-11 items-center justify-center rounded-lg border" aria-label="Stop response" onClick={() => { cancelled.current = true; pendingResult.current = null; stopActiveRun(); }}><Square className="size-4" /></button>
            : <button type="button" data-testid="discovery-ask-send" className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40" disabled={!draft.trim() || !isReady} aria-label="Send question" onClick={send}><ArrowUp className="size-4" /></button>}
        </div>
      )}
      {busy && draft.trim() ? <p className="mt-2 text-xs text-muted-foreground" role="status">Not sent yet. Finish or stop the current reply, then press Enter to send this question.</p> : null}
      {!signedOut && !isReady ? <p className="mt-2 text-xs text-muted-foreground" role="status">Connecting to MDE…</p> : null}
      {error ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-destructive">{error}</p>
          {agent?.messages.some((message) => message.role === "user") && !busy ? (
            <button type="button" data-testid="discovery-ask-retry" onClick={() => void retry()}
              className="min-h-11 rounded-md border border-border px-3 text-sm font-medium">
              Retry response
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// skipcq: JS-0067 - module-local React component; not browser global scope
export function DiscoveryAskComposer({ page, guestEvents, guestRestaurants, guestVenues, onAgentResults, hideHeading, suggestions, historyNote, hasSelectedItem, onClearSelection }: {
  page: Exclude<DiscoveryPage, "rentals">;
  guestEvents?: EventGuestOptions;
  /** Restaurants only: catalog search for signed-out visitors, using the public endpoint. */
  guestRestaurants?: RestaurantGuestOptions;
  /** Cafés and nightlife: venue-anchor search for signed-out visitors. */
  guestVenues?: VenueGuestOptions;
  onAgentResults?: (result: DiscoveryAgentResult) => void;
  hideHeading?: boolean;
  suggestions?: readonly string[];
  historyNote?: string;
  hasSelectedItem?: boolean;
  onClearSelection?: () => void;
}) {
  const coAgent = useOptionalConciergeCoAgent();
  if (isDeterministicE2E() || !coAgent) {
    return <div data-testid={`discovery-ask-${page}`} className="border-t p-4 text-sm text-muted-foreground">Ask MDE about {page} in the live application.</div>;
  }
  return <LiveComposer page={page} guestEvents={guestEvents} guestRestaurants={guestRestaurants} guestVenues={guestVenues} onAgentResults={onAgentResults} hideHeading={hideHeading} suggestions={suggestions} historyNote={historyNote} hasSelectedItem={hasSelectedItem} onClearSelection={onClearSelection} />;
}
