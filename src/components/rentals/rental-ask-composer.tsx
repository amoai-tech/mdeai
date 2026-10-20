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

const ERROR_COPY = "MDE could not answer that. Your question is still here — try again.";
const ERROR_COPY_RUN =
  "MDE could not answer that. Your question is in the conversation — open the full chat to continue.";
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

  const applyToolResult = useCallback(
    (payload: RentalAskResults, signature: string) => {
      if (!onResults || cancelled.current || appliedSignature.current === signature) return;
      appliedSignature.current = signature;
      toolResultSeen.current = true;
      hasAnswer.current = true;
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
      if (
        onResults &&
        !toolResultSeen.current &&
        turn === turnId.current &&
        !cancelled.current &&
        (!hasAnswer.current || carriesFilter(text))
      ) {
        try {
          const found = await searchRentalsForQuestion(text, lastQuery.current);
          if (!cancelled.current && turn === turnId.current) {
            if (typeof found === "string") {
              setError(found);
            } else {
              lastQuery.current = found.nextMemory;
              hasAnswer.current = true;
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
