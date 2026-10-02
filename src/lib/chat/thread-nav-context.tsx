"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type ThreadNavContextValue = {
  /** A saved thread Sofia picked in the nav rail, or undefined for a fresh chat. */
  activeThreadId: string | undefined;
  setActiveThreadId: Dispatch<SetStateAction<string | undefined>>;
  /** New Chat: drop the selection AND ask the chat surface for a brand-new thread. */
  clearActiveThread: () => void;
  /**
   * Increments on every New Chat. Clearing the selection alone is not enough:
   * when no saved thread was selected it changes nothing, so the chat would keep
   * writing to the thread it already had. Chat surfaces mint a new thread
   * whenever this changes.
   */
  newChatCount: number;
};

const ThreadNavContext = createContext<ThreadNavContextValue | null>(null);

export function ThreadNavProvider({ children }: { children: ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();
  const [newChatCount, setNewChatCount] = useState(0);

  const clearActiveThread = useCallback(() => {
    setActiveThreadId(undefined);
    setNewChatCount((n) => n + 1);
  }, []);

  return (
    <ThreadNavContext.Provider
      value={{ activeThreadId, setActiveThreadId, clearActiveThread, newChatCount }}
    >
      {children}
    </ThreadNavContext.Provider>
  );
}

export function useThreadNav() {
  const ctx = useContext(ThreadNavContext);
  if (!ctx) throw new Error("useThreadNav must be used within ThreadNavProvider");
  return ctx;
}
