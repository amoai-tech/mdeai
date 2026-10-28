"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WorkflowKind, WorkflowPhase } from "@/platform/copilot/workflow-steps";

type WorkflowSnapshot = {
  kind: WorkflowKind | null;
  phase: WorkflowPhase;
  startedAt: number | null;
};

type ChatWorkflowContextValue = {
  snapshot: WorkflowSnapshot;
  reportToolStatus: (kind: WorkflowKind, status: string) => void;
};

const ChatWorkflowContext = createContext<ChatWorkflowContextValue | null>(null);

const IDLE: WorkflowSnapshot = { kind: null, phase: "idle", startedAt: null };

export function ChatWorkflowProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(IDLE);
  const dismissalTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (dismissalTimer.current !== null) window.clearTimeout(dismissalTimer.current);
  }, []);

  const reportToolStatus = useCallback((kind: WorkflowKind, status: string) => {
    // A prior terminal status's dismissal must not hide newer progress.
    if (dismissalTimer.current !== null) {
      window.clearTimeout(dismissalTimer.current);
      dismissalTimer.current = null;
    }
    if (status === "failed" || status === "error" || status === "complete") {
      const phase: WorkflowPhase = status === "complete" ? "complete" : "error";
      setSnapshot((prev) =>
        phase === "error" || prev.kind === kind
          ? { kind, phase, startedAt: phase === "complete" ? prev.startedAt : Date.now() }
          : prev,
      );
      dismissalTimer.current = window.setTimeout(() => {
        dismissalTimer.current = null;
        setSnapshot((prev) =>
          prev.kind === kind && prev.phase === phase ? IDLE : prev,
        );
      }, phase === "complete" ? 2800 : 4000);
      return;
    }
    setSnapshot({ kind, phase: "running", startedAt: Date.now() });
  }, []);

  const value = useMemo(
    () => ({ snapshot, reportToolStatus }),
    [snapshot, reportToolStatus],
  );

  return (
    <ChatWorkflowContext.Provider value={value}>
      {children}
    </ChatWorkflowContext.Provider>
  );
}

export function useChatWorkflow() {
  const ctx = useContext(ChatWorkflowContext);
  if (!ctx) {
    throw new Error("useChatWorkflow must be used within ChatWorkflowProvider");
  }
  return ctx;
}
