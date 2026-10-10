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
  newProjectSearchEnvelopeSchema,
  type NewProjectSearchEnvelope,
} from "@/lib/new-projects/search-envelope";

type NewProjectFastPathContextValue = {
  toolResult: NewProjectSearchEnvelope | null;
  setToolResult: (result: unknown | null) => void;
};

const NewProjectFastPathContext = createContext<NewProjectFastPathContextValue | null>(null);

/** Holds the latest New Projects fast-path search envelope for the transcript tail to render. */
export function NewProjectFastPathProvider({ children }: { children: ReactNode }) {
  const [toolResult, setToolResultState] = useState<NewProjectSearchEnvelope | null>(null);

  // Validate at the context boundary: a malformed or error envelope becomes null, never a crash.
  const setToolResult = useCallback((result: unknown | null) => {
    if (result == null) {
      setToolResultState(null);
      return;
    }
    const parsed = newProjectSearchEnvelopeSchema.safeParse(result);
    setToolResultState(parsed.success ? parsed.data : null);
  }, []);

  const value = useMemo(() => ({ toolResult, setToolResult }), [toolResult, setToolResult]);

  return (
    <NewProjectFastPathContext.Provider value={value}>
      {children}
    </NewProjectFastPathContext.Provider>
  );
}

export function useNewProjectFastPath() {
  const ctx = useContext(NewProjectFastPathContext);
  if (!ctx) {
    throw new Error("useNewProjectFastPath must be used within NewProjectFastPathProvider");
  }
  return ctx;
}
