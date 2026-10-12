"use client";

import { useCallback } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

/** Shared concierge chat controller for v2 routes. */
function useLiveConciergeChat() {
  const { copilotkit } = useCopilotKit();
  const { agent } = useConciergeCoAgent();

  const isLoading = Boolean(agent?.isRunning);

  // True unless CopilotKit has a connected runtime. This is CopilotKit's own readiness rule
  // (useAgent / CopilotChat treat disconnected, connecting and error alike as "not ready"). Read at
  // call time so a send always sees the current state; compared as a string because the enum is not
  // part of the v2 surface this app imports from.
  const isRuntimeUnavailable = useCallback(
    () => String(copilotkit.runtimeConnectionStatus) !== "connected",
    [copilotkit],
  );

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

  const appendMessage = useCallback(
    async (content: string) => {
      if (!agent) return false;
      agent.addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content,
      });
      await copilotkit.runAgent({ agent });
      return true;
    },
    [agent, copilotkit],
  );

  return { isLoading, reset, stopActiveRun, appendMessage, isRuntimeUnavailable };
}

// The deterministic E2E surface answers fast paths locally; it must not mount
// or access the live agent/runtime. Every live hook caller retains the same
// interface so the session reset can still clear its local fast-path contexts.
const deterministicChat = {
  isLoading: false,
  reset: () => {},
  stopActiveRun: () => {},
  appendMessage: async (content: string) => {
    void content;
    return false;
  },
  isRuntimeUnavailable: () => true,
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
