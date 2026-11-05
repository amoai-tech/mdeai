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
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { isExpectedGuestStartup401, reportConciergeError } from "@/lib/concierge-error-store";
import { useSession } from "@/hooks/use-session";
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
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] });
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    threadId: string;
    attempt: number;
    failed: boolean;
  } | null>(null);

  // Watch the reconnect from the moment this thread (and agent) is selected.
  // Declared before the fetch effect so the subscription exists before CopilotKit
  // starts connecting; a Retry reuses it rather than waiting for a connect that
  // will not happen again.
  const connect = useRef<Promise<ConnectOutcome>>(Promise.resolve("done"));
  useEffect(() => {
    if (!agent) return;
    const controller = new AbortController();
    connect.current = watchConnectCycle(agent, controller.signal);
    return () => controller.abort();
  }, [agent, threadId]);

  useEffect(() => {
    if (!agent) return;
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      let failed = false;
      try {
        const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`history ${res.status}`);
        const body = (await res.json()) as { messages?: SavedThreadMessage[] };
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
      if (!signal.aborted) setOutcome({ threadId, attempt, failed });
    })();

    return () => controller.abort();
  }, [agent, threadId, attempt]);

  const settled = outcome?.threadId === threadId && outcome.attempt === attempt;
  const value = useMemo<SavedHistoryValue>(
    () => ({
      status: !settled ? "loading" : outcome.failed ? "error" : "idle",
      retry: () => setAttempt((n) => n + 1),
    }),
    [settled, outcome],
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
function LiveChatProvider({ children }: { children: ReactNode }) {
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
      generativeUI={{ ui: mdeUI, agentIds: ["conciergeAgent"] }}
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
          <SavedThreadHistory threadId={threadId}>{children}</SavedThreadHistory>
        ) : (
          children
        )}
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}

/**
 * Deterministic E2E renders its own chat and coagent stand-ins. Do not mount
 * the live CopilotKit provider: it can initiate agent/connection requests
 * while the browser is hydrating a test that exercises only local fast paths.
 * The production path remains the unchanged LiveChatProvider.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  if (isDeterministicE2E()) return <>{children}</>;
  return <LiveChatProvider>{children}</LiveChatProvider>;
}
