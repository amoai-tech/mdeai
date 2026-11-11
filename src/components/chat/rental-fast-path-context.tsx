"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RentalSearchApiParams } from "@/lib/rental-query-parser";

export type RentalSearchMeta = {
  userText: string;
  params: RentalSearchApiParams;
};

/** Only sanitized diagnostics from the existing rental API reach the UI. */
export type RentalSearchFailure = {
  status: number | null;
  code: string;
  retryable: boolean;
};

type RentalFastPathContextValue = {
  toolResult: unknown | null;
  /** Recent fast-path result envelopes for historical cards; thread-local. */
  toolResults: unknown[];
  setToolResult: (result: unknown | null) => void;
  /** Hydration can only fill an empty thread, never replace a newer live search. */
  restoreToolResult: (result: unknown) => boolean;
  reportRestoreFailure: (failure: RentalSearchFailure, retry: () => void) => void;
  /** New chat / thread switch: remove every result, not only the current one. */
  clearToolResults: () => void;
  searchMeta: RentalSearchMeta | null;
  setSearchMeta: (meta: RentalSearchMeta | null) => void;
  searchFailure: RentalSearchFailure | null;
  reportSearchFailure: (failure: RentalSearchFailure | null, retry?: () => void) => void;
  retryFailedSearch: () => void;
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
  const [searchFailure, setSearchFailure] = useState<RentalSearchFailure | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const currentResultRef = useRef<unknown | null>(null);

  const reportSearchFailure = useCallback(
    (failure: RentalSearchFailure | null, retry?: () => void) => {
      retryRef.current = failure?.retryable ? (retry ?? null) : null;
      setSearchFailure(failure);
    },
    [],
  );

  const retryFailedSearch = useCallback(() => {
    // The same request can only be retried once per visible failure. A new
    // failure recreates this handler; double taps cannot start duplicate reads.
    const retry = retryRef.current;
    if (!retry) return;
    retryRef.current = null;
    setSearchFailure(null);
    retry();
  }, []);

  const setToolResult = useCallback((result: unknown | null) => {
    currentResultRef.current = result;
    retryRef.current = null;
    setSearchFailure(null);
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

  const restoreToolResult = useCallback((result: unknown) => {
    if (currentResultRef.current != null) return false;
    setToolResult(result);
    return true;
  }, [setToolResult]);

  const reportRestoreFailure = useCallback((failure: RentalSearchFailure, retry: () => void) => {
    // A later successful user search supersedes a failed history rehydrate.
    if (currentResultRef.current == null) reportSearchFailure(failure, retry);
  }, [reportSearchFailure]);

  const clearToolResults = useCallback(() => {
    currentResultRef.current = null;
    retryRef.current = null;
    setSearchFailure(null);
    setToolResultState(null);
    setToolResults([]);
    setSearchMetaState(null);
  }, []);

  const setSearchMeta = useCallback((meta: RentalSearchMeta | null) => {
    setSearchMetaState(meta);
  }, []);

  const value = useMemo(
    () => ({
      toolResult, toolResults, setToolResult, restoreToolResult, reportRestoreFailure,
      clearToolResults, searchMeta, setSearchMeta,
      searchFailure, reportSearchFailure, retryFailedSearch,
    }),
    [toolResult, toolResults, setToolResult, restoreToolResult, reportRestoreFailure,
      clearToolResults, searchMeta, setSearchMeta,
      searchFailure, reportSearchFailure, retryFailedSearch],
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
