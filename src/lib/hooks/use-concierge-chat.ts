"use client";

import { useCallback } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";

/** Shared concierge chat controller for v2 routes. */
export function useConciergeChat() {
  const { copilotkit } = useCopilotKit();
  const { agent } = useConciergeCoAgent();

  const isLoading = Boolean(agent?.isRunning);

  // Stop a reply that is still streaming, the way CopilotChat's own Stop button
  // does. CopilotKit 1.75.0 clears the view on a thread switch but does not
  // stop an in-flight run, so without this the old answer streams into the new
  // conversation and is then saved there (reproduced on the SAN-1378 preview).
  const stopActiveRun = useCallback(() => {
    if (!agent?.isRunning) return;
    try {
      copilotkit.stopAgent({ agent });
    } catch {
      agent.abortRun();
    }
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
