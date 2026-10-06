"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type NewProjectFastPathContextValue = {
  toolResult: unknown | null;
  setToolResult: (result: unknown | null) => void;
};

const NewProjectFastPathContext = createContext<NewProjectFastPathContextValue | null>(null);

/** Holds the latest New Projects fast-path search envelope for the transcript tail to render. */
export function NewProjectFastPathProvider({ children }: { children: ReactNode }) {
  const [toolResult, setToolResultState] = useState<unknown | null>(null);

  const setToolResult = useCallback((result: unknown | null) => {
    setToolResultState(result);
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
