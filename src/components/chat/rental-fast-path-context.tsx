"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RentalSearchApiParams } from "@/lib/rental-query-parser";

export type RentalSearchMeta = {
  userText: string;
  params: RentalSearchApiParams;
};

type RentalFastPathContextValue = {
  toolResult: unknown | null;
  /** Recent fast-path result envelopes for historical cards; thread-local. */
  toolResults: unknown[];
  setToolResult: (result: unknown | null) => void;
  /** New chat / thread switch: remove every result, not only the current one. */
  clearToolResults: () => void;
  searchMeta: RentalSearchMeta | null;
  setSearchMeta: (meta: RentalSearchMeta | null) => void;
};

const RentalFastPathContext = createContext<RentalFastPathContextValue | null>(
  null,
);

export function RentalFastPathProvider({ children }: { children: ReactNode }) {
  const [toolResult, setToolResultState] = useState<unknown | null>(null);
  const [toolResults, setToolResults] = useState<unknown[]>([]);
  const [searchMeta, setSearchMetaState] = useState<RentalSearchMeta | null>(
    null,
  );

  const setToolResult = useCallback((result: unknown | null) => {
    setToolResultState(result);
    if (result != null) {
      setToolResults((previous) => [
        result,
        ...previous.filter((item) => item !== result),
      ].slice(0, 10));
    } else {
      setSearchMetaState(null);
    }
  }, []);

  const clearToolResults = useCallback(() => {
    setToolResultState(null);
    setToolResults([]);
    setSearchMetaState(null);
  }, []);

  const setSearchMeta = useCallback((meta: RentalSearchMeta | null) => {
    setSearchMetaState(meta);
  }, []);

  const value = useMemo(
    () => ({ toolResult, toolResults, setToolResult, clearToolResults, searchMeta, setSearchMeta }),
    [toolResult, toolResults, setToolResult, clearToolResults, searchMeta, setSearchMeta],
  );

  return (
    <RentalFastPathContext.Provider value={value}>
      {children}
    </RentalFastPathContext.Provider>
  );
}

export function useOptionalRentalFastPath(): RentalFastPathContextValue | null {
  return useContext(RentalFastPathContext);
}

export function useRentalFastPath() {
  const ctx = useContext(RentalFastPathContext);
  if (!ctx) {
    throw new Error("useRentalFastPath must be used within RentalFastPathProvider");
  }
  return ctx;
}
