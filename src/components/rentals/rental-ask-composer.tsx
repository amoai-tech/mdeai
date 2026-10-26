"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useConciergeCoAgent,
  useOptionalConciergeCoAgent,
} from "@/components/chat/concierge-coagent-context";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import { useSession } from "@/hooks/use-session";
import { getConciergeErrorVersion } from "@/lib/concierge-error-store";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";
import {
  payloadRows,
  useRentalToolResults,
  useTurns,
} from "@/components/rentals/rental-ask-tool-results";
import {
  ComposerError,
  ComposerHeader,
  ComposerInput,
  InertComposer,
  SHELL_CLASS,
  Transcript,
} from "@/components/rentals/rental-ask-composer-ui";
import {
  budgetNotApplied,
  buildRentalSearchParams,
  canFastPathRentalSearch,
  isWholeCityReply,
  scoreRentalQuery,
  statesBudget,
  type RentalSearchApiParams,
} from "@/lib/rental-query-parser";
import {
  unappliedRentalNotice,
  unappliedRentalRequests,
} from "@/lib/rental-display";
import { toDetailRental } from "@/lib/rentals/chat-rental-detail";
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

const ERROR_COPY = "MDE could not answer that. Your question is still here — try again.";
const ERROR_COPY_RUN =
  "MDE could not answer that. Your question is in the conversation — open the full chat to continue.";
/** Published for the phone Map button, so it clears the composer at any height. */
const HEIGHT_VAR = "--mde-ask-composer-height";
const SEARCH_UNAVAILABLE = "Rental search is temporarily unavailable. Please try again.";
const SEARCH_FAILED = "Could not search rentals right now. Please try again.";
const SEARCH_SESSION_EXPIRED = "Your session has expired. Sign in again to keep asking MDE.";
const SEARCH_FORBIDDEN = "This account cannot search rentals right now.";
const SEARCH_RATE_LIMITED = "Too many questions right now. Wait a moment, then try again.";
const BUDGET_NOT_APPLIED =
  "I could not apply a monthly budget from that question yet, so check the price on each card.";

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
  /**
   * Requests this search cannot filter, as labels. Carried across refinements so a later budget
   * question cannot make "furnished" look applied just because the current question named no
   * unsupported criterion of its own.
   */
  unappliedRequests?: string[];
};

/** The page's allowlisted filters, in the shape the shared parser refines. */
function contextMemory(context?: RentalAskContext): ConciergeWorkingMemory {
  const query: NonNullable<ConciergeWorkingMemory["lastRentalQuery"]> = {};
  if (context?.neighborhood) query.neighborhood = context.neighborhood;
  const beds = Number(context?.beds);
  if (Number.isInteger(beds) && beds >= 0) query.minBedrooms = beds;
  if (context?.from) query.checkIn = context.from;
  if (context?.through) query.checkOut = context.through;
  return Object.keys(query).length ? { lastRentalQuery: query } : {};
}

/** Keep the last search's constraints so the next follow-up refines them instead of starting over. */
function memoryFromParams(params: RentalSearchApiParams): ConciergeWorkingMemory {
  return {
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
  };
}

/**
 * A refinement is still the same search: if the renter asked for furnished in the first
 * question, telling them only about the new budget cap would imply the furnishing was applied.
 * Keep the unsupported request visible for the rest of this page's conversation.
 */
function withCarriedNotice(payload: RentalAskResults, labels: readonly string[]): RentalAskResults {
  // Merge labels, never the rendered sentence: a refinement can name its own unsupported request
  // ("and pet-friendly too"), and matching text would treat that notice as already complete.
  const merged = [...new Set([...(payload.unappliedRequests ?? []), ...labels])];
  if (merged.length === 0) return payload;
  return {
    ...payload,
    unappliedRequests: merged,
    budgetNotice: [payload.budgetNotice, unappliedRentalNotice(merged)]
      .filter(Boolean)
      .join(" ") || undefined,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Why a rental answer cannot be trusted, in words the renter can act on. A 401/403 is an access
 * problem, not a network blip, so it must not invite a pointless retry.
 */
function searchFailureMessage(status: number): string {
  if (status === 401) return SEARCH_SESSION_EXPIRED;
  if (status === 403) return SEARCH_FORBIDDEN;
  if (status === 429) return SEARCH_RATE_LIMITED;
  if (status === 503) return SEARCH_UNAVAILABLE;
  return SEARCH_FAILED;
}

/**
 * The same structured request the chat fast path posts, against the same endpoint.
 * No second search engine: the classification and parameters come from the shared parser.
 */
async function searchRentalsForQuestion(
  query: string,
  memory: ConciergeWorkingMemory,
  signal?: AbortSignal,
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
    signal,
  });
  if (!response.ok) return searchFailureMessage(response.status);

  // The route validates its own body, but the browser still owns this trust boundary: a malformed
  // 200 (a bad row, a negative total) must not replace the cards the renter is looking at.
  const envelope = (await response.json().catch(() => null)) as {
    results?: unknown;
    total?: unknown;
    budgetNote?: unknown;
  } | null;
  if (!envelope || !Array.isArray(envelope.results)) return SEARCH_FAILED;
  const rows: Rental[] = [];
  for (const row of envelope.results) {
    const rental = toDetailRental(row);
    if (!rental) return SEARCH_FAILED;
    rows.push(rental);
  }
  const total = envelope.total === undefined ? rows.length : envelope.total;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < rows.length) {
    return SEARCH_FAILED;
  }

  // Say what the search could not do. A monthly budget that reached the server is applied there;
  // unsupported requests travel as labels so the composer can carry them into a refinement.
  const notices = [
    typeof envelope.budgetNote === "string" ? envelope.budgetNote : undefined,
    budgetNotApplied(query, params ?? {}) ? BUDGET_NOT_APPLIED : undefined,
  ].filter((notice): notice is string => Boolean(notice));

  return {
    payload: {
      results: rows,
      total,
      query,
      budgetNotice: notices.length ? notices.join(" ") : undefined,
      unappliedRequests: unappliedRentalRequests(query),
    },
    // A follow-up ("only in Laureles", "under 3M") refines what the renter already asked for.
    nextMemory: params ? memoryFromParams(params) : memory,
  };
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
  // The supplementary structured search is cancelled on Stop, a new question, or unmount.
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const contextSeeded = useRef(false);
  // Only a question asked from THIS mount may replace this page's cards. A run that was already
  // streaming when a filter change remounted the page belongs to the old filters.
  const acceptToolResults = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);
  // Requests this search cannot filter, accumulated for this page's conversation.
  const unappliedRef = useRef<string[]>([]);

  // Refinements build on the previous rental question; a remount (filter change) starts fresh.
  const lastQuery = useRef<ConciergeWorkingMemory>({});
  // The agent's tool result owns the cards for this turn; the page search is only a fallback.
  const toolResultSeen = useRef(false);
  // True once this page has shown an answer. A follow-up that produces no rental tool result
  // ("which of these has a balcony?") must keep that answer, not rerun the question as a search.
  const hasAnswer = useRef(false);
  /** A follow-up that names a real filter may refine the search; one that only asks about the
   *  current rows ("which of these has a balcony?") must not be re-run as a broad catalogue query. */
  const carriesFilter = (text: string) => {
    // Inspect this turn alone: buildRentalSearchParams merges saved filters, which would make
    // a conversational question look like a new search after an earlier fallback.
    const signals = scoreRentalQuery(text);
    return signals.hasBudget || statesBudget(text) || signals.hasBedrooms ||
      signals.hasNeighborhood || signals.hasDateRange || isWholeCityReply(text);
  };
  const appliedSignature = useRef("");
  const turnId = useRef(0);
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  usePublishHeight(shellElement);

  // A request that outlives the page must never publish into it. The active answer is stopped too:
  // a filter change remounts this view, and the old question's rows must not land on the new list.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
      abortRef.current?.abort();
      stopRef.current?.();
    };
  }, []);

  // The latest stop function, without re-running the unmount effect when the agent changes.
  useEffect(() => {
    stopRef.current = stopActiveRun;
  }, [stopActiveRun]);

  const applyToolResult = useCallback(
    (payload: RentalAskResults, signature: string) => {
      if (
        !onResults ||
        !acceptToolResults.current ||
        cancelled.current ||
        !mounted.current ||
        appliedSignature.current === signature
      ) {
        return;
      }
      appliedSignature.current = signature;
      toolResultSeen.current = true;
      hasAnswer.current = true;
      const enriched = withCarriedNotice(payload, unappliedRef.current);
      onResults(enriched);
      setState((prev) => ({
        ...prev,
        lastRentalResults: payloadRows(enriched),
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
    acceptToolResults.current = true;
    cancelled.current = false;
    setSending(true);
    setError(null);
    setRetryable(false);
    // Clear on dispatch: the sent question is already on its way, and the box must be free for
    // the next question while this one streams (appending to it would send both together).
    setDraft("");
    // Remember every request this search cannot filter, so a later refinement keeps disclosing it.
    unappliedRef.current = [
      ...new Set([...unappliedRef.current, ...unappliedRentalRequests(text)]),
    ];
    // The first question starts from the filters this page already has. Without this, the
    // supplementary structured search would run a bare query and could ignore the URL filters.
    if (!contextSeeded.current) {
      contextSeeded.current = true;
      lastQuery.current = contextMemory(context);
    }
    // Record what this question asks for even when the agent's own tool produces the cards, so a
    // later follow-up ("only under 3M") still refines the neighborhood and size it came from.
    // The canonical parser decides this, not a second copy of the rules.
    const parsedForMemory = buildRentalSearchParams(text, lastQuery.current);
    if (parsedForMemory) lastQuery.current = memoryFromParams(parsedForMemory);
    // Give the agent the page the renter is on: the question's own constraints first, then the
    // open apartment. Written before the send so the answer describes these apartments.
    const questionFilters = lastQuery.current.lastRentalQuery ?? {};
    setState((prev) => ({
      ...prev,
      ...(context?.selectedListingId ? { selectedListingId: context.selectedListingId } : {}),
      lastRentalQuery: {
        ...prev.lastRentalQuery,
        ...questionFilters,
      },
    }));

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
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
      if (
        onResults &&
        !toolResultSeen.current &&
        turn === turnId.current &&
        !cancelled.current &&
        (!hasAnswer.current || carriesFilter(text))
      ) {
        try {
          const found = await searchRentalsForQuestion(text, lastQuery.current, abort.signal);
          if (!cancelled.current && mounted.current && turn === turnId.current) {
            if (typeof found === "string") {
              setError(found);
            } else {
              lastQuery.current = found.nextMemory;
              hasAnswer.current = true;
              const enriched = withCarriedNotice(found.payload, unappliedRef.current);
              onResults(enriched);
              // The fallback rows also become the agent's referent for "which of these…".
              setState((prev) => ({
                ...prev,
                ...found.nextMemory,
                lastRentalResults: payloadRows(enriched),
              }));
            }
          }
        } catch (error) {
          // A superseded or stopped request is not a failure the renter needs to see.
          if (
            !cancelled.current &&
            mounted.current &&
            turn === turnId.current &&
            !isAbortError(error)
          ) {
            setError(SEARCH_UNAVAILABLE);
          }
        }
      }
      if (mounted.current) setShowTranscript(true);
    } catch {
      if (!cancelled.current && mounted.current) {
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
      if (mounted.current) setSending(false);
    }
  }, [appendMessage, busy, draft, signedOut, isReady, onResults, context, setState]);

  const onStop = useCallback(() => {
    if (sendInFlight.current) cancelled.current = true;
    // Cancel the supplementary search too, so a stopped answer cannot still replace the cards.
    abortRef.current?.abort();
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
