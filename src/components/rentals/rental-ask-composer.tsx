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
import {
  budgetNotApplied,
  buildRentalSearchParams,
  canFastPathRentalSearch,
} from "@/lib/rental-query-parser";
import type { Rental } from "@/mastra/tools/search-rentals";
import type { ConciergeWorkingMemory } from "@/lib/types";

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
const SEARCH_UNAVAILABLE = "Rental search is temporarily unavailable. Please try again.";
const SEARCH_FAILED = "Could not search rentals right now. Please try again.";

/** What this page already knows, so the agent answers about the same apartments. */
export type RentalAskContext = {
  neighborhood?: string | null;
  beds?: string | null;
  from?: string | null;
  through?: string | null;
  /** The apartment whose Details panel is open, if any. */
  selectedListingId?: string | null;
};

/** What the browse column needs to replace its cards and pins with the answer. */
export type RentalAskResults = {
  results: Rental[];
  total: number;
  query: string;
  /** The question named a budget the search could not apply; say so instead of implying it did. */
  budgetNotice?: string;
};

/**
 * The same structured request the chat fast path posts, against the same endpoint.
 * No second search engine: the classification and parameters come from the shared parser.
 */
async function searchRentalsForQuestion(
  query: string,
  memory: ConciergeWorkingMemory,
): Promise<{ payload: RentalAskResults; nextMemory: ConciergeWorkingMemory } | string> {
  // A follow-up can be only a constraint ("under 3M"), which the fast-path gate rejects because it
  // does not look like a new rental search. Once a rental question exists, merge into it.
  let params = canFastPathRentalSearch(query, memory)
    ? buildRentalSearchParams(query, memory)
    : null;
  if (!params && memory.lastRentalQuery) {
    params = buildRentalSearchParams(query, memory);
  }
  const response = await fetch("/api/rentals/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Match the rental tool's own default (8), so the cards and the agent's answer are drawn
    // from the same rows instead of two different page sizes of the same search.
    body: JSON.stringify({ ...(params ?? { queryText: query }), limit: 8 }),
  });
  if (response.status === 503) return SEARCH_UNAVAILABLE;
  if (!response.ok) return SEARCH_FAILED;
  const data = (await response.json()) as { results?: Rental[]; total?: number };
  if (!Array.isArray(data.results)) return SEARCH_FAILED;
  return {
    payload: {
      results: data.results,
      total: data.total ?? data.results.length,
      query,
      budgetNotice: budgetNotApplied(query, params ?? {})
        ? "I could not apply a monthly budget from that question yet, so check the price on each card."
        : undefined,
    },
    // A follow-up ("only in Laureles", "under 3M") refines what the renter already asked for.
    nextMemory: params
      ? {
          lastRentalQuery: {
            neighborhood: params.neighborhood,
            minBedrooms: params.minBedrooms,
            maxPricePerNight: params.maxPricePerNight,
            maxPriceMonthly: params.maxPriceMonthly,
            budgetCurrency: params.budgetCurrency,
            budgetType: params.stayType,
            checkIn: params.checkIn,
            checkOut: params.checkOut,
          },
        }
      : memory,
  };
}

type PlainTurn = { id: string; role: "user" | "assistant"; text: string };
type AgentMessage = {
  id?: string;
  role?: string;
  content?: unknown;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: unknown;
};

const RENTAL_TOOL = /search[-_]?rentals/i;

/** Message text across the shapes the thread stores (plain string, or parts with text). */
function messageText(message: AgentMessage | undefined): string {
  const content = message?.content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as { content?: string; parts?: Array<{ type?: string; text?: string }> };
      const text = parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content;
      if (typeof text === "string") return text;
    } catch {
      return content;
    }
    return "";
  }
  if (content && typeof content === "object") {
    const parsed = content as { content?: string; parts?: Array<{ type?: string; text?: string }> };
    return parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content ?? "";
  }
  return "";
}

type ToolCallLike = { id?: string; function?: { name?: string } };

/** True when a parsed tool result looks like rental rows, for results whose call name is lost. */
function looksLikeRentalRows(results: unknown[]): boolean {
  const first = results[0] as { nightly_price?: unknown; price_monthly?: unknown; bedrooms?: unknown } | undefined;
  return Boolean(first && ("nightly_price" in first || "price_monthly" in first || "bedrooms" in first));
}

/**
 * The agent's own rental search result: the single source of truth for the cards.
 *
 * The client keeps the result on a `role: "tool"` message (toolCallId + JSON content) and the
 * tool's name on the preceding assistant message's `toolCalls`. The result carries no total, so
 * the honest count is the rows it returned — the same rows the answer was written from.
 */
function latestRentalToolResult(
  messages: readonly AgentMessage[],
): { signature: string; payload: RentalAskResults } | null {
  const callNames = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.toolCalls)) continue;
    for (const call of message.toolCalls as ToolCallLike[]) {
      if (call?.id && call.function?.name) callNames.set(call.id, call.function.name);
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "tool") continue;
    let data: unknown = message.content;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        continue;
      }
    }
    const envelope = data as { results?: unknown; budgetNote?: string } | null;
    if (!envelope || !Array.isArray(envelope.results) || envelope.results.length === 0) continue;
    const toolName = callNames.get(message.toolCallId ?? "") ?? "";
    if (toolName ? !RENTAL_TOOL.test(toolName) : !looksLikeRentalRows(envelope.results)) continue;
    const question = [...messages.slice(0, index)]
      .reverse()
      .find((candidate) => candidate.role === "user");
    const resultRows = envelope.results as (Rental & { id?: string })[];
    return {
      signature: `${message.toolCallId ?? index}:${resultRows.length}:${resultRows[0]?.id ?? ""}`,
      payload: {
        results: resultRows,
        total: resultRows.length,
        query: messageText(question),
        budgetNotice: envelope.budgetNote,
      },
    };
  }
  return null;
}

const payloadRows = (payload: RentalAskResults) =>
  payload.results.map((r) => ({
    id: r.id,
    title: r.title,
    neighborhood: r.neighborhood,
    nightly_price: r.nightly_price,
  }));

/** Keep only turns that have text, so tool/state-only messages do not leave blank rows. */
function plainTurns(messages: readonly AgentMessage[]): PlainTurn[] {
  const turns: PlainTurn[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return;
    const text = messageText(message).trim();
    if (!text) return;
    turns.push({ id: message.id ?? `${message.role}-${index}`, role: message.role, text });
  });
  return turns.slice(-TRANSCRIPT_LIMIT);
}

/** Copied messages, subscribed, so streaming and in-place mutations reach the transcript. */
function useTurns(agent: AbstractAgent | undefined): PlainTurn[] {
  const [snapshot, setSnapshot] = useState<{ agent: AbstractAgent | undefined; messages: readonly AgentMessage[] }>(
    () => ({ agent, messages: agent ? [...(agent.messages as unknown as AgentMessage[])] : [] }),
  );

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

/** Applies each new rental tool result once, as the agent streams it in. */
function useRentalToolResults(
  agent: AbstractAgent | undefined,
  onResult: (payload: RentalAskResults, signature: string) => void,
): void {
  useEffect(() => {
    if (!agent) return;
    let seen = "";
    const read = () => {
      const found = latestRentalToolResult(agent.messages as unknown as AgentMessage[]);
      if (!found || found.signature === seen) return;
      seen = found.signature;
      onResult(found.payload, found.signature);
    };
    const subscription = agent.subscribe({ onMessagesChanged: read });
    return () => subscription.unsubscribe();
  }, [agent, onResult]);
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

function ComposerError(props: { error: string; canRetry: boolean; retryable: boolean; onRetry: () => void }) {
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

function LiveComposer({ onResults, context }: { onResults?: (results: RentalAskResults) => void; context?: RentalAskContext }) {
  const { agent, isReady, setState } = useConciergeCoAgent();
  const { appendMessage, isLoading, stopActiveRun } = useConciergeChat();
  const { user, loading: sessionLoading } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Retry only when the user turn is known not to have been appended.
  const [retryable, setRetryable] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [sending, setSending] = useState(false);
  // The agent run status updates asynchronously, so React state alone cannot prevent two rapid sends.
  const sendInFlight = useRef(false);
  const cancelled = useRef(false);

  // Refinements build on the previous rental question; a remount (filter change) starts fresh.
  const lastQuery = useRef<ConciergeWorkingMemory>({});
  // The agent's tool result owns the cards for this turn; the page search is only a fallback.
  const toolResultSeen = useRef(false);
  const appliedSignature = useRef("");
  const turnId = useRef(0);
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  usePublishHeight(shellElement);

  const applyToolResult = useCallback(
    (payload: RentalAskResults, signature: string) => {
      if (!onResults || cancelled.current || appliedSignature.current === signature) return;
      appliedSignature.current = signature;
      toolResultSeen.current = true;
      onResults(payload);
      setState((prev) => ({
        ...prev,
        lastRentalResults: payloadRows(payload),
      }));
    },
    [onResults, setState],
  );
  useRentalToolResults(agent, applyToolResult);

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
    setRetryable(false);
    // Clear on dispatch: the sent question is already on its way, and the box must be free for
    // the next question while this one streams (appending to it would send both together).
    setDraft("");
    // Give the agent the page the renter is on: filters first, then the open apartment.
    // Written before the send so the answer describes these apartments, not a blank page.
    setState((prev) => ({
      ...prev,
      ...(context?.selectedListingId ? { selectedListingId: context.selectedListingId } : {}),
      lastRentalQuery: {
        ...prev.lastRentalQuery,
        ...(context?.neighborhood ? { neighborhood: context.neighborhood } : {}),
        ...(context?.beds ? { minBedrooms: Number(context.beds) } : {}),
        ...(context?.from ? { checkIn: context.from } : {}),
        ...(context?.through ? { checkOut: context.through } : {}),
      },
    }));
    const turn = ++turnId.current;
    toolResultSeen.current = false;
    const errorVersionBefore = getConciergeErrorVersion();
    let agentSendAttempted = false;
    try {
      if (cancelled.current) return;
      agentSendAttempted = true;
      const started = await appendMessage(text);
      // A stopped run must not bring the text back.
      if (cancelled.current) return;
      if (!started) {
        // Nothing was sent: give the words back, unless the user has already typed something else.
        setError(ERROR_COPY);
        setRetryable(true);
        setDraft((current) => (current === "" ? raw : current));
        return;
      }
      if (getConciergeErrorVersion() !== errorVersionBefore) {
        // The turn is already in the thread; a Retry here would add the same question twice.
        setError(ERROR_COPY_RUN);
        return;
      }
      // The cards normally come from the agent's own rental tool result. Only when the turn
      // produced none (an off-topic answer, a tool failure) does the page run a structured search,
      // so the renter is not left staring at a stale list.
      if (onResults && !toolResultSeen.current && turn === turnId.current && !cancelled.current) {
        try {
          const found = await searchRentalsForQuestion(text, lastQuery.current);
          if (!cancelled.current && turn === turnId.current) {
            if (typeof found === "string") {
              setError(found);
            } else {
              lastQuery.current = found.nextMemory;
              onResults(found.payload);
              // The fallback rows also become the agent's referent for "which of these…".
              setState((prev) => ({
                ...prev,
                ...found.nextMemory,
                lastRentalResults: payloadRows(found.payload),
              }));
            }
          }
        } catch {
          if (!cancelled.current) setError(SEARCH_UNAVAILABLE);
        }
      }
      setShowTranscript(true);
    } catch {
      if (!cancelled.current) {
        // runAgent may reject after addMessage already persisted the user turn.
        // Treat an attempted send as potentially started; never offer an unsafe resend.
        if (agentSendAttempted) {
          setError(ERROR_COPY_RUN);
        } else {
          setError(ERROR_COPY);
          setRetryable(true);
          setDraft((current) => (current === "" ? raw : current));
        }
      }
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }, [appendMessage, busy, draft, signedOut, isReady, onResults, context, setState]);

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
        <ComposerError error={error} canRetry={canSend} retryable={retryable} onRetry={() => { document.getElementById("rental-ask-input")?.focus(); void send(); }} />
      ) : null}
    </div>
  );
}

export function RentalAskComposer({
  onResults,
  context,
}: { onResults?: (results: RentalAskResults) => void; context?: RentalAskContext } = {}) {
  // Read the context without throwing: previews, isolated tests and deterministic E2E render this
  // page with no chat stack, and must get an inert box instead of an error.
  const coAgent = useOptionalConciergeCoAgent();
  if (isDeterministicE2E() || !coAgent) return <InertComposer />;
  return <LiveComposer onResults={onResults} context={context} />;
}
