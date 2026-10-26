"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { ensureThreadTitle } from "@/lib/chat/ensure-thread-title";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";
import {
  clearConciergeError,
  getConciergeErrorForThread,
  getConciergeErrorSnapshot,
  reportConciergeError,
} from "@/lib/concierge-error-store";
import { useOptionalThreadNav } from "@/lib/chat/thread-nav-context";

// runAgent awaits detachActiveRun before isRunning becomes true. Two quick
// Retry clicks can otherwise start the same turn twice, even across hook users.
const retriesInFlight = new WeakSet<object>();

/** Shared concierge chat controller for v2 routes. */
function useLiveConciergeChat() {
  const { copilotkit } = useCopilotKit();
  const { agent } = useConciergeCoAgent();
  // A send can begin while the runtime is connecting. Keep the most recent
  // agent after the connection changes instead of using a stale closure.
  const currentAgentRef = useRef(agent);
  const currentCopilotkitRef = useRef(copilotkit);
  useEffect(() => {
    currentAgentRef.current = agent;
    currentCopilotkitRef.current = copilotkit;
  }, [agent, copilotkit]);
  const threadNav = useOptionalThreadNav();
  const markThreadSaved = threadNav?.markThreadSaved;

  const isLoading = Boolean(agent?.isRunning);

  // True unless CopilotKit has a connected runtime. This is CopilotKit's own readiness rule
  // (useAgent / CopilotChat treat disconnected, connecting and error alike as "not ready"). Read at
  // call time so a send always sees the current state; compared as a string because the enum is not
  // part of the v2 surface this app imports from.
  const isRuntimeUnavailable = useCallback(
    () => String(copilotkit.runtimeConnectionStatus) !== "connected",
    [copilotkit],
  );

  /**
   * Await the existing CopilotKit handshake before a signed-in first send.
   * A connecting runtime may succeed within six seconds; an error or timeout
   * fails closed without starting an agent run or retrying any action.
   */
  const waitForRuntimeReady = useCallback(async (maxWaitMs = 6_000): Promise<boolean> => {
    const ready = () =>
      String(currentCopilotkitRef.current.runtimeConnectionStatus) === "connected" &&
      Boolean(currentAgentRef.current);
    if (ready()) return true;
    if (String(currentCopilotkitRef.current.runtimeConnectionStatus) === "error") return false;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 125));
      if (ready()) return true;
      if (String(currentCopilotkitRef.current.runtimeConnectionStatus) === "error") return false;
    }
    return ready();
  }, []);

  // Stop a reply that is still streaming before switching conversation.
  // CopilotKit 1.75.0 clears the view on a thread switch but leaves an
  // in-flight run attached, and for a runtime agent `stopAgent` only POSTs
  // `agent/stop` (core/src/agent.ts abortRun), which may reach a different
  // serverless instance than the one streaming. So also detach the browser
  // from the run, as CopilotChat does on a saved-thread switch: the old answer
  // still finishes and saves on its own thread, but no longer streams into, or
  // gets saved with, the new conversation (reproduced on the SAN-1378 preview).
  const stopActiveRun = useCallback(() => {
    if (!agent?.isRunning) return;
    try {
      copilotkit.stopAgent({ agent });
    } catch {
      agent.abortRun();
    }
    void agent.detachActiveRun().catch(() => {});
  }, [agent, copilotkit]);

  const reset = useCallback(() => {
    stopActiveRun();
    agent?.setMessages([]);
    agent?.setState({});
  }, [agent, stopActiveRun]);

  const retryLastTurn = useCallback(async () => {
    // Never start an empty/previous turn or a concurrent replay.
    if (!agent || agent.isRunning || retriesInFlight.has(agent) ||
        !agent.messages.some((message) => message.role === "user")) return false;
    const retryThreadId = agent.threadId;
    const priorError = getConciergeErrorForThread(retryThreadId);
    const latestError = getConciergeErrorSnapshot();
    // A notice from another conversation must never replay this agent's turn.
    if (priorError.threadId && priorError.threadId !== retryThreadId) return false;
    if (priorError.version === 0 && latestError.threadId &&
        latestError.threadId !== retryThreadId) return false;
    retriesInFlight.add(agent);
    clearConciergeError(retryThreadId);
    try {
      await copilotkit.runAgent({ agent });
      // CopilotKit can surface a stream error via onError without rejecting.
      const error = getConciergeErrorForThread(retryThreadId);
      if (error.version > 0) return false;
      // A thread change during retry must not save/title a different chat.
      if (agent.threadId === retryThreadId) {
        markThreadSaved?.(retryThreadId);
        if (retryThreadId) void ensureThreadTitle(retryThreadId);
      }
      return true;
    } catch (error) {
      console.error("[concierge-retry]", error);
      if (agent.threadId === retryThreadId) reportConciergeError(retryThreadId);
      return false;
    } finally {
      retriesInFlight.delete(agent);
    }
  }, [agent, copilotkit, markThreadSaved]);

  const appendMessage = useCallback(
    async (content: string) => {
      const currentAgent = currentAgentRef.current;
      if (!currentAgent) return false;
      // CopilotKit v2 useAgent() only copies the configured thread ID when the
      // configuration is explicit. Fresh threads are deliberately non-explicit,
      // so otherwise the agent invents a different ID and /chat cannot adopt
      // the saved conversation from this tab after a Rentals send.
      // Pin only a fresh, authenticated tab before the FIRST run; never
      // override an explicitly selected or previously persisted thread.
      if (threadNav?.ready && !threadNav.activeThreadId && !threadNav.hasPersistedThread &&
          threadNav.sessionThreadId) {
        // AG-UI's AbstractAgent is a mutable SDK object (the installed useAgent
        // assigns threadId directly too); this is not React render state.
        currentAgent.threadId = threadNav.sessionThreadId;
      }
      currentAgent.addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content,
      });
      await currentCopilotkitRef.current.runAgent({ agent: currentAgent });
      // Only completed turns are recorded as saved, never a freshly minted UUID.
      markThreadSaved?.(currentAgent.threadId);
      // Title the persisted conversation without delaying the user or navigation.
      if (currentAgent.threadId) void ensureThreadTitle(currentAgent.threadId);
      return true;
    },
    [markThreadSaved, threadNav],
  );

  return { isLoading, reset, stopActiveRun, retryLastTurn, appendMessage, isRuntimeUnavailable, waitForRuntimeReady };
}

// The deterministic E2E surface answers fast paths locally; it must not mount
// or access the live agent/runtime. Every live hook caller retains the same
// interface so the session reset can still clear its local fast-path contexts.
const deterministicChat = {
  isLoading: false,
  reset: () => {},
  stopActiveRun: () => {},
  retryLastTurn: async () => false,
  appendMessage: async (content: string) => {
    void content;
    return false;
  },
  isRuntimeUnavailable: () => true,
  waitForRuntimeReady: async () => false,
};
function useDeterministicConciergeChat() {
  return deterministicChat;
}

/**
 * Select once per build/module: Next inlines the non-production E2E flag in
 * client bundles. This preserves React hook order (no conditional hook calls),
 * and production always selects the unchanged live CopilotKit implementation.
 */
export const useConciergeChat = isDeterministicE2E()
  ? useDeterministicConciergeChat
  : useLiveConciergeChat;
