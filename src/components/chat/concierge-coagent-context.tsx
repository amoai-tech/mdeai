"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  useAgent,
  useCopilotKit,
  UseAgentUpdate,
  type AbstractAgent,
} from "@copilotkit/react-core/v2";
import type { ConciergeWorkingMemory } from "@/lib/types";

type ConciergeCoAgentValue = {
  agent: AbstractAgent | undefined;
  /** True when the real runtime-synced agent is available (not provisional). */
  isReady: boolean;
  state: ConciergeWorkingMemory;
  setState: (
    patch:
      | Partial<ConciergeWorkingMemory>
      | ((prev: ConciergeWorkingMemory) => ConciergeWorkingMemory),
  ) => void;
};

const ConciergeCoAgentContext = createContext<ConciergeCoAgentValue | null>(
  null,
);

/** Single useAgent mount for concierge — avoids duplicate CopilotKit sync POSTs. */
export function ConciergeCoAgentProvider({ children }: { children: ReactNode }) {
  const { copilotkit } = useCopilotKit();
  const { agent } = useAgent({
    agentId: "conciergeAgent",
    updates: [
      UseAgentUpdate.OnStateChanged,
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnMessagesChanged,
    ],
  });

  // Installed CopilotKit 1.55.2 does not expose useAgent().isReady yet.
  // Mirror its public provider-status gate instead of reading private agent fields.
  const isReady = useMemo(() => {
    if (!agent) return false;
    // Fail closed: if CopilotKit context is not available or runtimeUrl is missing,
    // the agent is not ready. This prevents sending to a disconnected agent.
    if (!copilotkit || copilotkit.runtimeUrl === undefined) return false;
    return copilotkit.runtimeConnectionStatus === "connected";
  }, [agent, copilotkit]);

  const state = useMemo(
    () => (agent?.state ?? {}) as ConciergeWorkingMemory,
    [agent?.state],
  );

  const setState = useCallback(
    (
      patch:
        | Partial<ConciergeWorkingMemory>
        | ((prev: ConciergeWorkingMemory) => ConciergeWorkingMemory),
    ) => {
      if (!agent) return;
      const current = (agent.state ?? {}) as ConciergeWorkingMemory;
      const next =
        typeof patch === "function" ? patch(current) : { ...current, ...patch };
      agent.setState(next);
    },
    [agent],
  );

  const value = useMemo(
    () => ({ agent, isReady, state, setState }),
    [agent, isReady, state, setState],
  );

  return (
    <ConciergeCoAgentContext.Provider value={value}>
      {children}
    </ConciergeCoAgentContext.Provider>
  );
}

export function useConciergeCoAgent(): ConciergeCoAgentValue {
  const ctx = useContext(ConciergeCoAgentContext);
  if (!ctx) {
    throw new Error(
      "useConciergeCoAgent must be used within ConciergeCoAgentProvider",
    );
  }
  return ctx;
}
