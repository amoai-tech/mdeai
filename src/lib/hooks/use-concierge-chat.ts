"use client";

import { useCallback } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";

/** Shared concierge chat controller for v2 routes. */
export function useConciergeChat() {
  const { copilotkit } = useCopilotKit();
  const { agent } = useConciergeCoAgent();

  const isLoading = Boolean(agent?.isRunning);

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

  return { isLoading, reset, stopActiveRun, appendMessage };
}
