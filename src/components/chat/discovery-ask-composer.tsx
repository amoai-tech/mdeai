"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { useOptionalConciergeCoAgent, useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import { useTurns } from "@/components/rentals/rental-ask-tool-results";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";
import { ArrowUp, Square } from "lucide-react";
import type { DiscoveryPage } from "@/components/chat/discovery-page-context";
import { getLatestDiscoveryToolResult, type DiscoveryAgentResult } from "./discovery-tool-results";

type EventGuestOptions = {
  category?: "music" | "food" | "culture" | "sport" | "nightlife" | null;
  neighborhood?: string | null;
  dateWindow?: "tonight" | "this_weekend" | "this_week" | "next_week" | "any" | null;
  onEventIds: (ids: string[]) => void;
};

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
      <button type="button" data-testid="guest-event-send" className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40" disabled={!question.trim() || busy} onClick={() => void send()} aria-label="Search events"><ArrowUp className="size-4" /></button>
    </div>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>;
}

/** One composer on every non-rental browse page; Rentals retains its richer search adapter. */
function LiveComposer({ page, guestEvents, onAgentResults }: { page: Exclude<DiscoveryPage, "rentals">; guestEvents?: EventGuestOptions; onAgentResults?: (result: DiscoveryAgentResult) => void }) {
  const { user, loading: sessionLoading } = useSession();
  const { agent, isReady } = useConciergeCoAgent();
  const { appendMessage, stopActiveRun, isLoading, isRuntimeUnavailable } = useConciergeChat();
  const turns = useTurns(agent);
  const path = usePathname();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  // A run's tool result may arrive in a separate agent update from its final text.
  // Retain the submitting page/filter callback rather than re-scoping old results
  // to filters changed while an answer is streaming.
  const pendingResult = useRef<{ since: number; emit: (result: DiscoveryAgentResult) => void } | null>(null);
  useEffect(() => {
    if (!agent) return;
    const publishCompletedResult = () => {
      const pending = pendingResult.current;
      if (!pending || agent.isRunning || cancelled.current) return;
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
  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || inFlight.current || busy || !isReady || signedOut || isRuntimeUnavailable()) return;
    inFlight.current = true;
    cancelled.current = false;
    setSending(true);
    setError(null);
    setDraft("");
    const startIndex = agent?.messages.length ?? 0;
    pendingResult.current = onAgentResults ? { since: startIndex, emit: onAgentResults } : null;
    try {
      const saved = await appendMessage(message);
      if (!saved && !cancelled.current) {
        setError("MDE could not send your question. Please try again.");
        setDraft((current) => current || message);
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
      if (!cancelled.current) setError("The response was interrupted. Check the conversation before retrying.");
    } finally {
      pendingResult.current = null;
      inFlight.current = false;
      setSending(false);
    }
  }, [agent, appendMessage, busy, draft, isReady, isRuntimeUnavailable, onAgentResults, page, signedOut]);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };
  return (
    <section data-testid={`discovery-ask-${page}`} aria-label={`Ask MDE about ${page}`} className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <strong className="text-sm">Ask MDE</strong>
        <div className="flex items-center gap-3 text-xs">
          {turns.length > 0 ? <button type="button" className="min-h-11 text-muted-foreground" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} data-testid="discovery-ask-history-toggle">{showHistory ? "Hide" : "Show"} conversation</button> : null}
          <Link href="/chat" className="inline-flex min-h-11 items-center text-primary">Open full chat</Link>
        </div>
      </div>
      {showHistory && turns.length > 0 ? (
        <ol data-testid="discovery-ask-history" role="log" aria-live="polite" className="mb-2 max-h-52 space-y-2 overflow-auto rounded-lg border p-3">
          {turns.map((t) => <li key={t.id} className="text-sm"><span className="mr-2 text-xs font-medium text-muted-foreground">{t.role === "user" ? "You" : "MDE"}:</span>{t.text}</li>)}
        </ol>
      ) : null}
      {signedOut && page === "events" && guestEvents ? <GuestEventComposer options={guestEvents} /> : signedOut ? (
        <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Sign in to ask about {page}.</p><Link className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground" href={`/login?next=${encodeURIComponent(path)}`}>Sign in</Link></div>
      ) : (
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`discovery-ask-input-${page}`}>Ask MDE about {page}</label>
          <textarea id={`discovery-ask-input-${page}`} data-testid="discovery-ask-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} rows={1} placeholder={`Ask about ${page}…`} className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-base focus-visible:ring-2 focus-visible:ring-ring sm:text-sm" />
          {busy ? <button type="button" data-testid="discovery-ask-stop" className="flex size-11 items-center justify-center rounded-lg border" aria-label="Stop response" onClick={() => { cancelled.current = true; pendingResult.current = null; stopActiveRun(); }}><Square className="size-4" /></button>
            : <button type="button" data-testid="discovery-ask-send" className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40" disabled={!draft.trim() || !isReady} aria-label="Send question" onClick={() => void send()}><ArrowUp className="size-4" /></button>}
        </div>
      )}
      {!signedOut && !isReady ? <p className="mt-2 text-xs text-muted-foreground" role="status">Connecting to MDE…</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
    </section>
  );
}

export function DiscoveryAskComposer({ page, guestEvents, onAgentResults }: { page: Exclude<DiscoveryPage, "rentals">; guestEvents?: EventGuestOptions; onAgentResults?: (result: DiscoveryAgentResult) => void }) {
  const coAgent = useOptionalConciergeCoAgent();
  if (isDeterministicE2E() || !coAgent) {
    return <div data-testid={`discovery-ask-${page}`} className="border-t p-4 text-sm text-muted-foreground">Ask MDE about {page} in the live application.</div>;
  }
  return <LiveComposer page={page} guestEvents={guestEvents} onAgentResults={onAgentResults} />;
}
