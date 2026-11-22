"use client";

import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  UseAgentUpdate,
  useAgent,
  type AbstractAgent,
} from "@copilotkit/react-core/v2";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { reconcileSavedHistory, type SavedThreadMessage } from "@/lib/chat/saved-thread-history";
import { useThreadNav } from "@/lib/chat/thread-nav-context";
import { clearLiveUserMessage, isLiveUserMessage } from "@/lib/chat/live-user-message-ids";
import { MDE_GENERATIVE_UI } from "@/components/copilot/a2ui/mde-generative-ui";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { isExpectedGuestStartup401, reportConciergeError } from "@/lib/concierge-error-store";
import {
  isBlankAssistantMessage,
  seedBlankLedgerFromHistory,
  shouldReportBlankOnce,
  type BlankReportLedger,
} from "@/lib/blank-assistant-message";
import { useSession } from "@/hooks/use-session";
import type { RentalSearchApiParams } from "@/lib/rental-query-parser";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

/**
 * Longest we wait for CopilotKit's own reconnect before showing the retryable
 * error. Generous on purpose: a cold serverless start plus Mastra setup can take
 * several seconds, and a spurious error is worse than a longer "Loading…".
 */
const RECONNECT_SETTLE_TIMEOUT_MS = 30_000;
// An idle (already-connected) agent does not emit a new run-finalized event.
// Do not make returning users stare at an empty transcript for 30 seconds.
const QUIET_RECONNECT_GRACE_MS = 2_500;


type SavedHistoryValue = {
  /** `idle` = nothing to wait for (fresh chat, or history is in place). */
  status: "idle" | "loading" | "error";
  /** Current, owner-checked thread only; never a previous selection. */
  threadId?: string;
  /** Search criteria only; grounded cards are fetched by a child of the rental provider. */
  lastRentalSearch?: RentalSearchApiParams | null;
  /** IDs returned by the owner-checked history GET; new turns may be interleaved during restore. */
  restoredMessageIds?: readonly string[];
  retry: () => void;
};

const SavedHistoryContext = createContext<SavedHistoryValue>({
  status: "idle",
  retry: () => {},
});

/** Whether a saved chat's previous messages are still loading (SAN-1389). */
export function useSavedThreadHistory(): SavedHistoryValue {
  return useContext(SavedHistoryContext);
}

type ConnectOutcome = "done" | "timeout" | "aborted";

/**
 * Watches CopilotKit's own `agent/connect` for this thread, from the moment the
 * chat opens. Not "is the agent running right now": `connectAgent` starts
 * asynchronously and clears the view when it begins, so a check made before it
 * starts would pass too early and the install would be wiped. A timeout is a
 * separate outcome, never "done".
 */
function watchConnectCycle(agent: AbstractAgent, signal: AbortSignal): Promise<ConnectOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve("aborted");
    const finish = (outcome: ConnectOutcome) => {
      clearTimeout(timer);
      subscription.unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = () => finish("aborted");
    const subscription = agent.subscribe({
      onRunFinalized: () => finish("done"),
      onRunFailed: () => finish("done"),
    });
    const timer = setTimeout(() => finish("timeout"), RECONNECT_SETTLE_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort);
  });
}

/**
 * Replays a saved chat's previous messages into CopilotKit, once.
 *
 * Ordering is the whole point:
 * 1. fetch the owner-checked history (`/api/threads/[id]/messages`);
 * 2. wait for CopilotKit's own `agent/connect` for this thread to finish. It
 *    clears the view when it starts, and on a warm server it replays this
 *    thread, so installing earlier would be wiped or shown twice. The wait is
 *    started when the chat opens, not when the fetch returns;
 * 3. only then install, and only if the thread is still the selected one. The
 *    durable history is the base and anything CopilotKit already holds is
 *    reconciled into it (a warm replay may be partial), so every message shows
 *    once. A late response for a chat Sofia has since left is dropped (abort +
 *    the `agent.threadId` check). If the reconnect never finishes, history is
 *    NOT installed: the chat shows the retryable error instead.
 */
export function SavedThreadHistory({
  threadId,
  children,
  agentId = "conciergeAgent",
}: {
  threadId: string;
  children: ReactNode;
  agentId?: "conciergeAgent" | "hostOpsAgent";
}) {
  const { agent, isReady } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged, UseAgentUpdate.OnMessagesChanged] });
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    threadId: string;
    attempt: number;
    failed: boolean;
    /** Distinguishes a timeout before SDK readiness from the real agent's restore. */
    ready: boolean;
    /** UI-visible completion metadata; refs are accessed only in effects. */
    agent?: AbstractAgent;
    hadMessages?: boolean;
    lastRentalSearch?: RentalSearchApiParams | null;
    savedMessageIds?: readonly string[];
  } | null>(null);

  // Preserve completed history through transient readiness changes. A genuinely
  // replaced or cleared agent must still restore its own durable messages.
  const restoredAgent = useRef<{
    threadId: string;
    attempt: number;
    agent: AbstractAgent;
    hadMessages: boolean;
    savedMessages: SavedThreadMessage[];
  } | null>(null);
  const restoredThisAttempt =
    outcome?.threadId === threadId && outcome.attempt === attempt &&
    outcome.ready && !outcome.failed;
  const restoredOnCurrentAgent = Boolean(
    restoredThisAttempt && outcome?.agent === agent &&
    (!outcome.hadMessages || agent?.messages.length),
  );
  const missingRestoredHistory = Boolean(
    isReady && restoredThisAttempt && outcome?.agent === agent &&
    outcome.hadMessages && agent?.messages.length === 0,
  );

  // Do not run the owner-checked fetch against CopilotKit's provisional agent.
  // A permanently unavailable runtime must still show an honest retryable error,
  // not an endless spinner while isReady remains false.
  useEffect(() => {
    if (isReady || restoredThisAttempt) return;
    const timeout = setTimeout(() => {
      setOutcome({ threadId, attempt, failed: true, ready: false });
    }, RECONNECT_SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isReady, threadId, attempt, restoredThisAttempt]);

  // Watch the reconnect from the moment this thread (and agent) is selected.
  // Declared before the fetch effect so the subscription exists before CopilotKit
  // starts connecting; a Retry reuses it rather than waiting for a connect that
  // will not happen again.
  const connect = useRef<Promise<ConnectOutcome>>(Promise.resolve("done"));
  useEffect(() => {
    if (!agent || !isReady) return;
    const previous = restoredAgent.current;
    // Once this real agent was restored, a later message wipe is repaired by
    // the dedicated message-change effect below, not a second history fetch.
    if (previous?.threadId === threadId && previous.agent === agent) return;
    const controller = new AbortController();
    connect.current = watchConnectCycle(agent, controller.signal);
    return () => controller.abort();
  }, [agent, isReady, threadId]);

  useEffect(() => {
    if (!agent || !isReady) return;
    const previous = restoredAgent.current;
    // Once this real agent was restored, a later message wipe is repaired by
    // the dedicated message-change effect below, not a second history fetch.
    if (previous?.threadId === threadId && previous.attempt === attempt &&
        previous.agent === agent) return;
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      let failed = false;
      let savedMessages: SavedThreadMessage[] = [];
      let lastRentalSearch: RentalSearchApiParams | null = null;
      try {
        const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
          signal,
          cache: "no-store",
        });
        // This component mounts only for a selected, restored, or known-saved
        // thread. A missing row must remain a visible retryable error. Fresh
        // unpersisted chats do not mount this component at all.
        if (!res.ok) throw new Error(`history ${res.status}`);
        const body = (await res.json()) as {
          messages?: SavedThreadMessage[];
          lastRentalSearch?: RentalSearchApiParams | null;
        };
        savedMessages = body.messages ?? [];
        lastRentalSearch = body.lastRentalSearch ?? null;
        // First attempt: the watch started when the chat opened. A Retry cannot
        // reuse a finished (timed-out) watch, so it waits again if the reconnect
        // is still running, and carries on if it has ended.
        // On a healthy warm tab there may be no agent/connect run to finalize.
        // Give a late reconnect a short chance to start; if the agent remains
        // idle, restore its persisted transcript now instead of waiting 30s.
        const connection = connect.current;
        const first = attempt === 0
          ? await Promise.race<ConnectOutcome | "idle">([
              connection,
              new Promise<"idle">((resolve) => {
                setTimeout(() => resolve("idle"), QUIET_RECONNECT_GRACE_MS);
              }),
            ])
          : agent.isRunning ? await watchConnectCycle(agent, signal) : "done";
        const settled = first === "idle" && agent.isRunning
          ? await connection
          : first === "idle" ? "done" : first;
        // If connect starts AFTER the quiet grace and clears the view, replay
        // again after it finishes. Reconciliation is ID-based and preserves new
        // turns; a late completion from another thread cannot change this one.
        if (first === "idle" && body.messages?.length) {
          void connection.then((outcome) => {
            if (outcome !== "done" || signal.aborted || agent.threadId !== threadId) return;
            const merged = reconcileSavedHistory(body.messages!, agent.messages);
            if (merged.length !== agent.messages.length ||
                merged.some((msg, i) => msg.id !== agent.messages[i]?.id)) {
              agent.setMessages(merged as typeof agent.messages);
            }
          });
        }
        if (settled === "aborted" || signal.aborted || agent.threadId !== threadId) return;
        // Timed out and still reconnecting: do not install into a moving agent.
        if (settled === "timeout" && agent.isRunning) throw new Error("reconnect did not finish");
        if (body.messages?.length) {
          const merged = reconcileSavedHistory(body.messages, agent.messages);
          // A warm replay that already matches is left as CopilotKit's own.
          const live = agent.messages;
          const same = merged.length === live.length && merged.every((m, i) => m.id === live[i].id);
          if (!same) agent.setMessages(merged as typeof live);
        }
      } catch {
        if (signal.aborted) return;
        failed = true;
      }
      if (!signal.aborted) {
        if (!failed) {
          restoredAgent.current = {
            threadId, attempt, agent, hadMessages: agent.messages.length > 0, savedMessages,
          };
        }
        setOutcome({
          threadId, attempt, failed, ready: true,
          agent: failed ? undefined : agent,
          hadMessages: !failed && agent.messages.length > 0,
          lastRentalSearch: failed ? null : lastRentalSearch,
          savedMessageIds: failed ? undefined : savedMessages.map((message) => message.id),
        });
      }
    })();

    return () => controller.abort();
    // Keep this dependency list fixed at four entries. A dev hot reload that
    // changes its length can trigger React's "changed size between renders"
    // warning; a hard reload recreates the effect with its current shape.
  }, [agent, isReady, threadId, attempt]);

  /**
   * The newest NON-EMPTY transcript seen for this thread on the current agent.
   *
   * The restore snapshot is captured when the chat opens, so it cannot contain
   * turns the user sends afterwards. Retaining the live transcript lets a later
   * wipe be repaired with those newer messages instead of regressing to the older
   * snapshot, and covers a chat that started empty and only later received turns.
   */
  /** Blank-turn ids already reported for the CURRENT thread (see the B2 detector). */
  const blankLedger = useRef<BlankReportLedger | null>(null);

  const retained = useRef<{
    threadId: string;
    agent: AbstractAgent;
    messages: readonly unknown[];
  } | null>(null);

  // Refs are written only inside effects (never during render).
  //
  // Retain ONLY after this thread's restore completed on this agent. CopilotKit can
  // set the new threadId before it clears the previous transcript, so a thread A→B
  // switch would otherwise capture A's messages as B's and recovery would replay
  // them into the wrong conversation (and into B's next run).
  const restoredForThisThread = Boolean(
    restoredThisAttempt && outcome?.agent === agent,
  );
  useEffect(() => {
    if (!agent || agent.threadId !== threadId || !restoredForThisThread) {
      retained.current = null;
      return;
    }
    if (agent.messages.length > 0) {
      retained.current = { threadId, agent, messages: [...agent.messages] };
    }
  }, [agent, threadId, agent?.messages, restoredForThisThread]);

  // Additive recovery: independent of the restore snapshot above, repair a cleared
  // transcript from the newest turns this session observed. Runs after the
  // retention effect, so `retained` still holds the pre-wipe transcript.
  const liveMessageCount = agent && agent.threadId === threadId ? agent.messages.length : -1;
  useEffect(() => {
    if (!isReady || !agent || agent.threadId !== threadId) return;
    if (agent.messages.length !== 0) return;
    // A run in progress owns the transcript; the existing repair path handles the
    // stuck-run case and surfaces a retryable error instead of racing the run.
    if (agent.isRunning) return;
    const newest = retained.current;
    if (!newest || newest.threadId !== threadId || newest.agent !== agent) return;
    if (newest.messages.length === 0) return;
    const merged = reconcileSavedHistory(
      newest.messages as SavedThreadMessage[],
      agent.messages,
    );
    if (merged.length > 0) agent.setMessages(merged as typeof agent.messages);
  }, [agent, isReady, threadId, liveMessageCount]);

  // B2: a finished assistant message that renders nothing is a FAILED turn.
  //
  // The intermittent symptom was a `200` whose stream produced an empty bubble: nothing
  // treated it as an error, so the customer saw a blank reply and no Retry. Detection
  // happens when a run finalises, and it reuses the existing retryable notice.
  useEffect(() => {
    if (!isReady || !agent || agent.threadId !== threadId) return;
    // This effect re-runs on every message-count change, so the ledger must survive the
    // re-runs or the same blank turn would re-push the notice. It is reset only when the
    // conversation changes.
    if (blankLedger.current?.threadId !== threadId) {
      blankLedger.current = { threadId, ids: new Set<string>(), seeded: false };
    }
    const ledger = blankLedger.current;
    // A blank reply that was already on screen when this conversation opened is history,
    // not a failure the customer just experienced. Absorb it before inspecting.
    seedBlankLedgerFromHistory(
      ledger,
      agent.messages.map((message) => message.id),
    );
    const inspect = () => {
      if (agent.isRunning) return;
      const last = agent.messages[agent.messages.length - 1];
      if (!last) return;
      if (!isBlankAssistantMessage(last as { role?: string; content?: unknown; toolCalls?: unknown[] })) return;
      if (!shouldReportBlankOnce(ledger, last.id)) return;
      reportConciergeError(threadId);
    };
    const subscription = agent.subscribe({ onRunFinalized: inspect });
    // A reconnect can finalise without a run-finalized event; re-check on count changes.
    inspect();
    return () => subscription.unsubscribe();
  }, [agent, isReady, threadId, liveMessageCount]);

  // The SDK can clear messages after readiness has recovered (for example,
  // a delayed reconnect). React to OnMessagesChanged and restore from the
  // already owner-checked snapshot rather than leaving the chat inert forever.
  useEffect(() => {
    const saved = restoredAgent.current;
    if (!missingRestoredHistory || !agent || !saved) return;
    let active = true;
    const repair = () => {
      if (!active || agent.threadId !== threadId || agent.isRunning || !saved.savedMessages.length) return;
      const merged = reconcileSavedHistory(saved.savedMessages, agent.messages);
      if (merged.length !== agent.messages.length ||
          merged.some((message, index) => message.id !== agent.messages[index]?.id)) {
        agent.setMessages(merged as typeof agent.messages);
      }
    };
    const subscription = agent.subscribe({
      onRunFinalized: repair,
      onRunFailed: repair,
    });
    const timeout = setTimeout(() => {
      if (active && agent.threadId === threadId && agent.messages.length === 0) {
        setOutcome({ threadId, attempt, failed: true, ready: true });
      }
    }, RECONNECT_SETTLE_TIMEOUT_MS);
    repair();
    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [agent, threadId, attempt, missingRestoredHistory]);

  const settled = outcome?.threadId === threadId && outcome.attempt === attempt &&
    // Once restored, a transient readiness loss must not make chat inert.
    (outcome.ready === isReady || restoredThisAttempt) &&
    // A replaced/cleared real agent must replay before its history is usable.
    (!isReady || !restoredThisAttempt || restoredOnCurrentAgent);
  const value = useMemo<SavedHistoryValue>(
    () => ({
      status: !settled ? "loading" : outcome.failed ? "error" : "idle",
      threadId: settled && !outcome.failed ? threadId : undefined,
      lastRentalSearch: settled && !outcome.failed ? outcome.lastRentalSearch : null,
      restoredMessageIds: settled && !outcome.failed ? outcome.savedMessageIds : undefined,
      retry: () => setAttempt((n) => n + 1),
    }),
    [settled, outcome, threadId],
  );

  return <SavedHistoryContext.Provider value={value}>{children}</SavedHistoryContext.Provider>;
}

/**
 * Replay a saved thread's messages inside an already-configured CopilotKit provider.
 *
 * `/chat` owns its provider; discovery routes (Rentals, Events, Restaurants…) already get
 * `CopilotChatConfigurationProvider` from `copilot-kit-provider`, so they only need the history
 * replay. Without this, the thread id survives a refresh but the inline Ask MDE transcript comes
 * back empty and the page shows the plain catalogue.
 */
export function SavedThreadReplay({
  threadId,
  children,
}: {
  threadId: string;
  children: ReactNode;
}) {
  if (isDeterministicE2E()) return <>{children}</>;
  return <SavedThreadHistory threadId={threadId}>{children}</SavedThreadHistory>;
}

/**
 * The /chat concierge surface, and the one place its thread is decided.
 *
 * - A saved thread picked in the nav rail is bound as EXPLICIT, so the chat
 *   continues that exact thread.
 * - Otherwise the chat uses the root per-tab thread, shared with other pages.
 *   New Chat mints a fresh ID; only a persisted thread is reconnected.
 *
 * One `CopilotChatConfigurationProvider` owns that choice for every consumer on
 * the page (chat, map sync, tools), so they cannot drift onto different threads.
 * A saved thread also replays its previous messages (`SavedThreadHistory`); a
 * fresh chat never fetches history and stays empty.
 * `useThreadNav` is the single source of truth; nothing here calls the
 * configuration provider's imperative setters.
 */
function LiveChatProvider({ children, persistThread = false }: { children: ReactNode; persistThread?: boolean }) {
  const { user, loading: sessionLoading } = useSession();
  const { sessionThreadId, activeThreadId, hasPersistedThread, restoredThread } = useThreadNav();
  const threadId = activeThreadId ?? sessionThreadId;
  // A successfully saved live turn must NOT immediately reconnect/replay itself.
  // Remember whether this tab's thread was already saved when /chat mounted;
  // when the user returns after visiting Rentals, it is now safe to replay.
  const [initialRestorableThread] = useState(() => hasPersistedThread ? sessionThreadId : undefined);
  // A refresh/reopen adopts the stored conversation AFTER auth resolves, which
  // is later than the mount-time capture above; that stored conversation is
  // exactly what must be replayed.
  const shouldReplay = Boolean(activeThreadId || restoredThread ||
    (hasPersistedThread && initialRestorableThread === sessionThreadId));

  // A provider mounted before auth settles can send a guest /info request which
  // returns after sign-in, making a *guest* 401 look like a signed-in failure.
  // Match the discovery provider: start only with a resolved identity, and
  // remount on actual user changes so old requests keep their original context.
  if (sessionLoading && !user) return null;

  return (
    <CopilotKitProvider
      key={user?.id ?? "guest"}
      {...getCopilotKitClientProps("conciergeAgent")}
      generativeUI={MDE_GENERATIVE_UI}
      enableInspector={false}
      onError={(event) => {
        if (isExpectedGuestStartup401(event, Boolean(user), sessionLoading)) return;
        // Never drop a real failure, including a run failure during a session
        // refresh while the existing signed-in identity remains available.
        reportConciergeError(threadId);
      }}
    >
      <CopilotChatConfigurationProvider
        agentId="conciergeAgent"
        threadId={threadId}
        hasExplicitThreadId={shouldReplay}
      >
        {threadId && shouldReplay && !isDeterministicE2E() ? (
          <SavedThreadHistory threadId={threadId}>
            {persistThread && user ? <BrokerThreadSaverAfterReplay threadId={threadId} /> : null}
            {children}
          </SavedThreadHistory>
        ) : (
          <>
            {persistThread && threadId && user ? <BrokerThreadSaver threadId={threadId} /> : null}
            {children}
          </>
        )}
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}

/**
 * Bridge between the history replay and the saver: waits for the owner-checked GET to settle, then
 * hands its restored message ids to the saver so a replayed answer is never written twice.
 */
function BrokerThreadSaverAfterReplay({ threadId }: { threadId: string }) {
  const history = useSavedThreadHistory();
  const restoreMode = history.status === "error" ? "failed"
    : history.status === "idle" && history.threadId === threadId ? "restored" : "waiting";
  return (
    <BrokerThreadSaver
      threadId={threadId}
      restoreMode={restoreMode}
      restoredMessageIds={history.restoredMessageIds}
    />
  );
}

/**
 * Marks a broker's conversation as reloadable and stores its questions.
 *
 * Replies are not written here: the Mastra runtime already stores each one as `<id>-agui-text`,
 * and a second copy under the plain AG-UI id made a restored transcript show the answer twice.
 * Questions are posted the moment they are sent, because the reader orders by createdAt and a
 * later stamp put each question below its answer. Reloadability is claimed only when the run has
 * finished and an answer exists, so the thread is never advertised before it can be restored.
 */
export function BrokerThreadSaver({
  threadId,
  agentId = "conciergeAgent",
  restoreMode = "fresh",
  restoredMessageIds,
}: {
  threadId: string;
  agentId?: "conciergeAgent";
  restoreMode?: "fresh" | "waiting" | "restored" | "failed";
  restoredMessageIds?: readonly string[];
}) {
  const { agent } = useAgent({
    agentId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { markThreadSaved } = useThreadNav();
  // Track local send identity; SDK replays can also contain user-role messages.
  const progress = useRef({
    threadId,
    handledIds: new Set<string>(),
    failedIds: new Set<string>(),
    retriedAfterRun: false,
    inFlight: false,
  });
  const [drainTick, setDrainTick] = useState(0);
  useEffect(() => {
    if (progress.current.threadId !== threadId) {
      progress.current = {
        threadId,
        handledIds: new Set<string>(),
        failedIds: new Set<string>(),
        retriedAfterRun: false,
        inFlight: false,
      };
    }
  }, [threadId]);

  // CopilotKit returns one stable, mutable agent: use its moving fields as dependencies.
  const messages = agent.messages ?? [];
  const messageCount = messages.length;
  const messageIdsKey = messages.map((message) => message.id).join("\u0000");
  const lastContent = messages[messageCount - 1]?.content ?? "";
  const running = Boolean(agent.isRunning);
  const agentThreadId = agent.threadId;
  useEffect(() => {
    const state = progress.current;
    // Never write an old thread's messages to a newly selected thread.
    if (state.threadId !== threadId || agentThreadId !== threadId) return;
    const current = agent.messages ?? [];
    if (state.inFlight) return;
    if (running) state.retriedAfterRun = false;
    // A save that failed mid-run is retried exactly once when the run ends. Driving this from the
    // POST's `finally` cannot work: that block runs while the turn is still streaming.
    if (!running && state.failedIds.size > 0 && !state.retriedAfterRun) {
      state.retriedAfterRun = true;
      state.failedIds.clear();
      if (progress.current === state) setDrainTick((n) => n + 1);
      return;
    }
    // A failed history GET is NOT proof that those messages are saved. Resume from the live
    // transcript (the POST endpoint still independently authenticates and checks ownership).
    if (restoreMode === "restored") {
      for (const id of restoredMessageIds ?? []) {
        state.handledIds.add(id);
        clearLiveUserMessage(agent, threadId, id);
      }
    }

    // During the GET, reconnect can insert old user-role messages. Only IDs explicitly
    // created at the local send boundary may be posted while waiting.
    // Only questions are ours to write. Stamped when sent, so the history reader (which orders by
    // createdAt) never puts the runtime's reply above the question that produced it.
    const answerFollowsLatestQuestion = (list: typeof current): boolean => {
      let question = -1;
      let answer = -1;
      list.forEach((message, index) => {
        if (typeof message.content !== "string" || message.content.trim().length === 0) return;
        if (message.role === "user") question = index;
        else if (message.role === "assistant" && !state.handledIds.has(message.id)) answer = index;
      });
      return answer > question;
    };

    const text: { id: string; role: "user" | "assistant"; content: string }[] = [];
    const handledInBatch: string[] = [];
    for (const message of current) {
      if (state.handledIds.has(message.id) || state.failedIds.has(message.id)) continue;
      if (restoreMode === "waiting" &&
          !isLiveUserMessage(agent, threadId, message.id, message.content)) continue;
      // Questions only. The Mastra runtime already stores each assistant reply (as
      // `<id>-agui-text`); posting it again under the plain AG-UI id produced two rows for one
      // answer, and the id-based idempotency cannot dedupe two different ids.
      if (message.role === "user" &&
          typeof message.content === "string" && message.content.trim().length > 0) {
        text.push({ id: message.id, role: message.role, content: message.content });
        handledInBatch.push(message.id);
        if (text.length === 4) break; // The messages endpoint accepts at most four per call.
      }
    }
    if (text.length === 0) {
      // Nothing new to write. If the run has finished and its answer exists, the exchange is
      // complete, so the thread can be advertised as reloadable -- this is the common case after
      // the question was posted at send time.
      // A question that never reached the server means this conversation is not restorable.
      if (!running && state.failedIds.size === 0 && answerFollowsLatestQuestion(current)) {
        markThreadSaved(threadId);
      }
      return;
    }

    state.inFlight = true;
    let saved = false;
    void fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: text }),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) {
          console.warn(`[BrokerThreadSaver] save failed: ${response.status}`);
          // Retrying this question on every streamed chunk would hammer the endpoint; it is
          // retried once the run ends instead (see the drain guard below).
          for (const id of handledInBatch) state.failedIds.add(id);
          return;
        }
        saved = true;
        for (const id of handledInBatch) {
          state.handledIds.add(id);
          clearLiveUserMessage(agent, threadId, id);
        }
        // Re-read at completion: an answer can land while this POST is in flight, and the values
        // captured when the effect started would miss it. Restored ids are already handled, so a
        // replayed answer is never counted as a new one.
        const live = agent.messages ?? [];
        const pendingAnswer = answerFollowsLatestQuestion(live);
        // A question alone is not restore-able; the runtime's reply is what replay needs.
        if (!agent.isRunning && state.failedIds.size === 0 && pendingAnswer) {
          markThreadSaved(threadId);
        }
      })
      .catch((error) => {
        console.warn("[BrokerThreadSaver] save failed", error);
        // A rejected fetch is a failed save too. Hold these IDs until the bounded post-run
        // retry; otherwise each streamed chunk can resend the same rejected question.
        for (const id of handledInBatch) state.failedIds.add(id);
      })
      .finally(() => {
        state.inFlight = false;
        // A finished POST is not an agent update. Drain pending complete answers explicitly,
        // but never enter an infinite retry loop after a failed POST.
            // The run may end while this POST is still settling; the effect then returns on
        // `inFlight` and the retry would never fire. Nudge it once here.
        if (!agent.isRunning && state.failedIds.size > 0 && !state.retriedAfterRun &&
            progress.current === state) {
          setDrainTick((n) => n + 1);
        }
        const rest = agent.messages ?? [];
        const pending = rest.some((message) => !state.handledIds.has(message.id) &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" && message.content.trim().length > 0);
        if (saved && progress.current === state && pending) setDrainTick((n) => n + 1);
      });
  }, [agent, agentThreadId, threadId, markThreadSaved, messageCount, lastContent, running,
    drainTick, restoreMode, restoredMessageIds, messageIdsKey]);

  return null;
}

/**
 * Deterministic E2E renders its own chat and coagent stand-ins. Do not mount
 * the live CopilotKit provider: it can initiate agent/connection requests
 * while the browser is hydrating a test that exercises only local fast paths.
 * The production path remains the unchanged LiveChatProvider.
 */
export function ChatProvider({
  children,
  persistThread = false,
}: {
  children: ReactNode;
  /** Opt in to writing completed turns to history, so a reload can replay them. */
  persistThread?: boolean;
}) {
  if (isDeterministicE2E()) return <>{children}</>;
  return <LiveChatProvider persistThread={persistThread}>{children}</LiveChatProvider>;
}
