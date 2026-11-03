"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useAgent,
  UseAgentUpdate,
  type AbstractAgent,
} from "@copilotkit/react-core/v2";
import type { ConciergeWorkingMemory } from "@/lib/types";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

type ConciergeCoAgentValue = {
  agent: AbstractAgent | undefined;
  /** True when the active provider can accept concierge state/messages. */
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

/** Live CopilotKit agent mount for concierge. */
function LiveConciergeCoAgentProvider({ children }: { children: ReactNode }) {
  const { agent, isReady } = useAgent({
    agentId: "conciergeAgent",
    updates: [
      UseAgentUpdate.OnStateChanged,
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnMessagesChanged,
    ],
  });

  // useAgent().isReady tracks the actual bound runtime agent. A separate
  // CopilotKitCore status snapshot can lag after the info request succeeds,
  // leaving the send button disabled even though the agent is usable.
  const ready = Boolean(agent && isReady);
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
    () => ({ agent, isReady: ready, state, setState }),
    [agent, ready, state, setState],
  );

  return (
    <ConciergeCoAgentContext.Provider value={value}>
      {children}
    </ConciergeCoAgentContext.Provider>
  );
}

/** Local state provider for deterministic E2E; never mounts live CopilotKit transport. */
function DeterministicConciergeCoAgentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setStateValue] = useState<ConciergeWorkingMemory>({});
  const setState = useCallback(
    (
      patch:
        | Partial<ConciergeWorkingMemory>
        | ((prev: ConciergeWorkingMemory) => ConciergeWorkingMemory),
    ) => {
      setStateValue((current) =>
        typeof patch === "function" ? patch(current) : { ...current, ...patch },
      );
    },
    [],
  );
  const value = useMemo(
    () => ({ agent: undefined, isReady: true, state, setState }),
    [state, setState],
  );

  return (
    <ConciergeCoAgentContext.Provider value={value}>
      {children}
    </ConciergeCoAgentContext.Provider>
  );
}

/** Deterministic E2E avoids useAgent/SSE while production keeps the live agent. */
export function ConciergeCoAgentProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (isDeterministicE2E()) {
    return (
      <DeterministicConciergeCoAgentProvider>
        {children}
      </DeterministicConciergeCoAgentProvider>
    );
  }

  return (
    <LiveConciergeCoAgentProvider>{children}</LiveConciergeCoAgentProvider>
  );
}

/**
 * SAN-1421 — the non-throwing read, for UI that is also rendered where no concierge provider is
 * mounted (isolated component tests, local previews, deterministic E2E). Callers must handle `null`
 * by rendering an inert surface rather than sending.
 */
export function useOptionalConciergeCoAgent(): ConciergeCoAgentValue | null {
  return useContext(ConciergeCoAgentContext);
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
