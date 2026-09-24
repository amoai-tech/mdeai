"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
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
  const { copilotkit } = useCopilotKit();
  const { agent } = useAgent({
    agentId: "conciergeAgent",
    updates: [
      UseAgentUpdate.OnStateChanged,
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnMessagesChanged,
    ],
  });

  // Installed @copilotkit/react-core 1.55.2 does not expose useAgent().isReady.
  // CopilotKitCore is an external mutable store. useSyncExternalStore reads a
  // current snapshot after subscribing, so a cold connecting -> connected
  // transition cannot be lost between render and the subscription effect.
  const subscribeToRuntimeStatus = useCallback(
    (onStoreChange: () => void) => {
      const subscription = copilotkit.subscribe({
        onRuntimeConnectionStatusChanged: () => onStoreChange(),
      });
      return () => subscription.unsubscribe();
    },
    [copilotkit],
  );
  const getRuntimeConnectionStatus = useCallback(
    () => copilotkit.runtimeConnectionStatus,
    [copilotkit],
  );
  const runtimeConnectionStatus = useSyncExternalStore(
    subscribeToRuntimeStatus,
    getRuntimeConnectionStatus,
    getRuntimeConnectionStatus,
  );

  const isReady = Boolean(
    agent &&
    copilotkit.runtimeUrl !== undefined &&
    runtimeConnectionStatus === "connected",
  );

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
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT === "1"
  ) {
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

export function useConciergeCoAgent(): ConciergeCoAgentValue {
  const ctx = useContext(ConciergeCoAgentContext);
  if (!ctx) {
    throw new Error(
      "useConciergeCoAgent must be used within ConciergeCoAgentProvider",
    );
  }
  return ctx;
}
