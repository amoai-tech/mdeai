"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type EventFastPathContextValue = {
  toolResult: unknown | null;
  /** Recent successful fast-path result envelopes for historical cards; thread-local. */
  toolResults: unknown[];
  setToolResult: (result: unknown | null) => void;
  /** New chat / thread switch: remove every result, not only the current one. */
  clearToolResults: () => void;
};

const EventFastPathContext = createContext<EventFastPathContextValue | null>(
  null,
);

export function EventFastPathProvider({ children }: { children: ReactNode }) {
  const [toolResult, setToolResultState] = useState<unknown | null>(null);
  const [toolResults, setToolResults] = useState<unknown[]>([]);

  const setToolResult = useCallback((result: unknown | null) => {
    setToolResultState(result);
    if (result != null) {
      setToolResults((previous) => [
        result,
        ...previous.filter((item) => item !== result),
      ].slice(0, 10));
    }
  }, []);

  const clearToolResults = useCallback(() => {
    setToolResultState(null);
    setToolResults([]);
  }, []);

  const value = useMemo(
    () => ({ toolResult, toolResults, setToolResult, clearToolResults }),
    [toolResult, toolResults, setToolResult, clearToolResults],
  );

  return (
    <EventFastPathContext.Provider value={value}>
      {children}
    </EventFastPathContext.Provider>
  );
}

export function useOptionalEventFastPath(): EventFastPathContextValue | null {
  return useContext(EventFastPathContext);
}

export function useEventFastPath() {
  const ctx = useContext(EventFastPathContext);
  if (!ctx) {
    throw new Error(
      "useEventFastPath must be used within EventFastPathProvider",
    );
  }
  return ctx;
}
