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
  useState,
  type ReactNode,
} from "react";
import type { SavedThreadMessage } from "@/lib/chat/saved-thread-history";
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

/** Resolves once the agent is not running (CopilotKit's /connect has settled). */
function waitForAgentIdle(agent: AbstractAgent, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!agent.isRunning) return resolve();
    const done = () => {
      clearTimeout(timer);
      subscription.unsubscribe();
      signal.removeEventListener("abort", done);
      resolve();
    };
    const subscription = agent.subscribe({
      onRunFinalized: done,
      onRunFailed: done,
    });
    const timer = setTimeout(done, RECONNECT_SETTLE_TIMEOUT_MS);
    signal.addEventListener("abort", done);
  });
}

/**
 * Replays a saved chat's previous messages into CopilotKit, once.
 *
 * Ordering is the whole point:
 * 1. fetch the owner-checked history (`/api/threads/[id]/messages`);
 * 2. wait for CopilotKit's own `agent/connect` for this thread to finish — on a
 *    warm server it already replays this thread, and installing first would
 *    show every message twice;
 * 3. only then install, and only if the thread is still the selected one and
 *    the view is empty. A late response for a chat Sofia has since left is
 *    dropped (abort + the `agent.threadId` check).
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
        await waitForAgentIdle(agent, signal);
        if (signal.aborted || agent.threadId !== threadId) return;
        if (agent.messages.length === 0 && body.messages?.length) {
          agent.setMessages(body.messages);
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
