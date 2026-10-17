"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from "react";
import { useSession } from "@/hooks/use-session";

const STORAGE_KEY = "mde:thread-selection:v1";
const HISTORY_KEY = "__mde_chat_selection";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TabThread = {
  owner: string;
  sessionThreadId: string;
  activeThreadId?: string;
  savedThreadId?: string;
};
type HistorySelection = { owner: string; threadId: string | null };

function parseTabThread(raw: string | null, owner: string): TabThread | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.owner !== owner || typeof record.sessionThreadId !== "string" ||
        !UUID.test(record.sessionThreadId)) return null;
    return {
      owner,
      sessionThreadId: record.sessionThreadId,
      ...(typeof record.activeThreadId === "string" && UUID.test(record.activeThreadId) &&
        { activeThreadId: record.activeThreadId }),
      ...(typeof record.savedThreadId === "string" && UUID.test(record.savedThreadId) &&
        { savedThreadId: record.savedThreadId }),
    };
  } catch { return null; }
}

function historySelection(owner: string): string | null | undefined {
  const value: unknown = window.history.state?.[HISTORY_KEY];
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<HistorySelection>;
  if (record.owner !== owner) return undefined;
  if (record.threadId === null) return null;
  return typeof record.threadId === "string" && UUID.test(record.threadId)
    ? record.threadId : undefined;
}

function recordSelection(owner: string, threadId: string | null, push: boolean) {
  const state = { ...window.history.state, [HISTORY_KEY]: { owner, threadId } };
  // Keep the current URL and all of Next's internal history fields intact.
  if (push) window.history.pushState(state, "", window.location.href);
  else window.history.replaceState(state, "", window.location.href);
}

type ThreadNavContextValue = {
  ready: boolean;
  sessionThreadId: string | undefined;
  activeThreadId: string | undefined;
  /** A persisted thread is explicit; an unused client-side UUID is not. */
  hasPersistedThread: boolean;
  setActiveThreadId: Dispatch<SetStateAction<string | undefined>>;
  selectSavedThread: (id: string) => void;
  markThreadSaved: (id: string) => void;
  clearActiveThread: () => void;
  newChatCount: number;
};

const ThreadNavContext = createContext<ThreadNavContextValue | null>(null);

export function ThreadNavProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const owner = user?.id ?? "anon";
  const [tab, setTab] = useState<TabThread | null>(null);
  const [newChatCount, setNewChatCount] = useState(0);
  const ready = !loading && tab?.owner === owner;

  useEffect(() => {
    if (loading) return;
    let stored: TabThread | null = null;
    try {
      // sessionStorage is per tab. An opener can copy it on first navigation,
      // but must not copy the original tab's conversation.
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const copiedFromOpener = Boolean(window.opener && nav?.type === "navigate");
      stored = copiedFromOpener ? null : parseTabThread(sessionStorage.getItem(STORAGE_KEY), owner);
    } catch { /* Storage may be disabled; in-memory navigation still works. */ }
    const fromHistory = historySelection(owner);
    const initial = stored ?? { owner, sessionThreadId: crypto.randomUUID() };
    const next: TabThread = {
      ...initial,
      activeThreadId: fromHistory === undefined
        ? initial.activeThreadId : fromHistory ?? undefined,
    };
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setTab(next);
    });
    recordSelection(owner, next.activeThreadId ?? null, false);
    return () => { cancelled = true; };
  }, [owner, loading]);

  useEffect(() => {
    if (!ready || !tab) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tab)); } catch { /* no storage */ }
  }, [tab, ready]);

  useEffect(() => {
    if (!ready) return;
    const onPopState = () => {
      const threadId = historySelection(owner);
      if (threadId === undefined || threadId === (tab?.activeThreadId ?? null)) return;
      // The chat surface detaches an in-flight answer and clears stale cards
      // before changing threads. Nothing listens outside /chat.
      window.dispatchEvent(new Event("mde:chat-history-selection"));
      setTab((old) => old?.owner === owner
        ? { ...old, activeThreadId: threadId ?? undefined } : old);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [owner, ready, tab?.activeThreadId]);

  const setActiveThreadId = useCallback<Dispatch<SetStateAction<string | undefined>>>((value) => {
    setTab((old) => old?.owner === owner
      ? { ...old, activeThreadId: typeof value === "function" ? value(old.activeThreadId) : value }
      : old);
  }, [owner]);

  const selectSavedThread = useCallback((id: string) => {
    if (!ready || !UUID.test(id)) return;
    recordSelection(owner, id, true);
    setActiveThreadId(id);
  }, [owner, ready, setActiveThreadId]);

  const clearActiveThread = useCallback(() => {
    if (!ready) return;
    recordSelection(owner, null, true);
    setTab({ owner, sessionThreadId: crypto.randomUUID() });
    setNewChatCount((n) => n + 1);
  }, [owner, ready]);

  const markThreadSaved = useCallback((id: string) => {
    // Owned transcript replay is authenticated. A guest's local fast path or
    // agent turn must never be advertised as a reloadable saved conversation.
    if (owner === "anon" || !UUID.test(id)) return;
    setTab((old) => old?.owner === owner && old.sessionThreadId === id && !old.activeThreadId
      ? { ...old, savedThreadId: id } : old);
  }, [owner]);

  const value = useMemo<ThreadNavContextValue>(() => ({
    ready: Boolean(ready),
    sessionThreadId: ready ? tab?.sessionThreadId : undefined,
    activeThreadId: ready ? tab?.activeThreadId : undefined,
    hasPersistedThread: Boolean(ready && (tab?.activeThreadId || tab?.savedThreadId === tab?.sessionThreadId)),
    setActiveThreadId, selectSavedThread, markThreadSaved, clearActiveThread, newChatCount,
  }), [ready, tab, setActiveThreadId, selectSavedThread, markThreadSaved, clearActiveThread, newChatCount]);

  return (
    <ThreadNavContext.Provider value={value}>
      {ready ? children : (
        <main id="main-content" className="grid min-h-dvh place-items-center text-sm text-muted-foreground">
          <p role="status">Restoring your workspace…</p>
        </main>
      )}
    </ThreadNavContext.Provider>
  );
}

export function useThreadNav() {
  const ctx = useContext(ThreadNavContext);
  if (!ctx) throw new Error("useThreadNav must be used within ThreadNavProvider");
  return ctx;
}

/** Optional for low-level hooks also exercised without the route provider in unit tests. */
export function useOptionalThreadNav() {
  return useContext(ThreadNavContext);
}
