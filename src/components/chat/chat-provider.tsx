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
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import { reportConciergeError } from "@/lib/concierge-error-store";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

/** Longest we wait for CopilotKit's own reconnect before replaying history. */
const RECONNECT_SETTLE_TIMEOUT_MS = 10_000;

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
function SavedThreadHistory({
  threadId,
  children,
}: {
  threadId: string;
  children: ReactNode;
}) {
  const { agent } = useAgent({ agentId: "conciergeAgent", updates: [UseAgentUpdate.OnRunStatusChanged] });
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
        const settled = await connect.current;
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
 * The /chat concierge surface, and the one place its thread is decided.
 *
 * - A saved thread picked in the nav rail is bound as EXPLICIT, so the chat
 *   continues that exact thread.
 * - Otherwise the chat runs on a fresh, NON-explicit thread: new on every visit
 *   to /chat and on every New Chat, so a new conversation never writes into an
 *   old one and does not try to reconnect to a thread that has never run.
 *
 * One `CopilotChatConfigurationProvider` owns that choice for every consumer on
 * the page (chat, map sync, tools), so they cannot drift onto different threads.
 * A saved thread also replays its previous messages (`SavedThreadHistory`); a
 * fresh chat never fetches history and stays empty.
 * `useThreadNav` is the single source of truth; nothing here calls the
 * configuration provider's imperative setters.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { activeThreadId, newChatCount } = useThreadNav();

  // React's "adjust state when a prop changes" pattern: a new id the moment
  // New Chat is pressed, with no intermediate render on the old thread.
  const [fresh, setFresh] = useState(() => ({
    newChatCount,
    threadId: crypto.randomUUID(),
  }));
  if (fresh.newChatCount !== newChatCount) {
    setFresh({ newChatCount, threadId: crypto.randomUUID() });
  }

  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("conciergeAgent")}
      enableInspector={false}
      onError={reportConciergeError}
    >
      <CopilotChatConfigurationProvider
        agentId="conciergeAgent"
        threadId={activeThreadId ?? fresh.threadId}
        hasExplicitThreadId={activeThreadId !== undefined}
      >
        {activeThreadId !== undefined && !isDeterministicE2E() ? (
          <SavedThreadHistory threadId={activeThreadId}>{children}</SavedThreadHistory>
        ) : (
          children
        )}
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
