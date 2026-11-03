"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from "react";
import { useSession } from "@/hooks/use-session";

const STORAGE_KEY = "mde:thread-selection:v1";
const HISTORY_KEY = "__mde_chat_selection";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Owner of the client-minted thread before the verified session is known. */
const PENDING = "pending";

type TabThread = {
  owner: string;
  sessionThreadId: string;
  activeThreadId?: string;
  savedThreadId?: string;
  /** Adopted from this tab's stored state on this page load (refresh/reopen). */
  restored?: boolean;
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
      // "restored" is derived on adoption, never trusted from storage.
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
  /** The verified owner is known and this tab's conversation is resolved. */
  ready: boolean;
  sessionThreadId: string | undefined;
  activeThreadId: string | undefined;
  /** A persisted thread is explicit; an unused client-side UUID is not. */
  hasPersistedThread: boolean;
  /** This tab loaded an existing saved conversation (refresh / reopen). */
  restoredThread: boolean;
  /**
   * A stored saved conversation exists but the verified owner is not known yet.
   * Only this case needs to wait for auth; a fresh tab must not.
   */
  restoringSavedThread: boolean;
  setActiveThreadId: Dispatch<SetStateAction<string | undefined>>;
  selectSavedThread: (id: string) => void;
  markThreadSaved: (id: string) => void;
  clearActiveThread: () => void;
  newChatCount: number;
};

const ThreadNavContext = createContext<ThreadNavContextValue | null>(null);

/**
 * One conversation identity per browser tab, shared by /chat and every discovery
 * route. It must be available on the FIRST render: gating the app on the auth
 * round-trip meant a slow session (or a cold route compile) held back the whole
 * chat shell, including the server-rendered, disabled composer.
 *
 * Isolation is unchanged: a conversation is only reattached after the verified
 * owner is known, and only when the stored selection belongs to that owner.
 * Until then the tab gets a brand-new, non-explicit UUID that cannot replay
 * anyone's history.
 */
export function ThreadNavProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const owner = user?.id ?? "anon";
  // Client-minted so the chat has one stable id from its first paint. The
  // server's value is never rendered, so hydration is unaffected; the client
  // initializer value is the one the app keeps.
  const [tab, setTab] = useState<TabThread>(() => ({
    owner: PENDING,
    sessionThreadId: crypto.randomUUID(),
  }));
  const [newChatCount, setNewChatCount] = useState(0);
  // An explicit New Chat cancels any stored history awaiting authentication.
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  // Reading this is not a decision about ownership: it only decides whether the
  // UI must wait for the verified session before it can reattach a conversation.
  // A fresh tab has nothing to restore, so a slow auth call must not disable the
  // composer or hold back a selection.
  const [mayRestore] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const value = JSON.parse(raw) as { activeThreadId?: unknown; savedThreadId?: unknown };
      return typeof value.activeThreadId === "string" || typeof value.savedThreadId === "string";
    } catch { return false; }
  });
  const ready = !loading && tab.owner === owner;
  const restoringSavedThread = !ready && mayRestore && !restoreDismissed;

  useEffect(() => {
    if (loading || tab.owner === owner) return;
    let stored: TabThread | null = null;
    try {
      // sessionStorage is per tab. An opener can copy it on first navigation,
      // but must not copy the original tab's conversation.
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const copiedFromOpener = Boolean(window.opener && nav?.type === "navigate");
      stored = copiedFromOpener || restoreDismissed
        ? null : parseTabThread(sessionStorage.getItem(STORAGE_KEY), owner);
    } catch { /* Storage may be disabled; in-memory navigation still works. */ }
    const fromHistory = historySelection(owner);
    const next: TabThread = stored
      ? {
          ...stored,
          restored: true,
          activeThreadId: fromHistory === undefined
            ? stored.activeThreadId : fromHistory ?? undefined,
        }
      : tab.owner === PENDING
        // This tab's pre-auth id. Keep it so a new conversation never changes
        // identity once the renter can type.
        ? { ...tab, owner }
        : { owner, sessionThreadId: crypto.randomUUID() };
    // Deferred out of the effect body (react-hooks/set-state-in-effect): the
    // resolved tab is committed on the next microtask. A re-run before that
    // (owner changed again) cancels the stale update.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setTab(next);
    });
    recordSelection(owner, next.activeThreadId ?? null, false);
    return () => { cancelled = true; };
  }, [owner, loading, tab, restoreDismissed]);

  useEffect(() => {
    // Before the owner is resolved, only a selection the person just made may
    // be written. Writing the empty pre-auth tab would overwrite the stored
    // conversation that is still waiting to be reattached during a slow login.
    if (!ready && !tab.activeThreadId) return;
    try {
      // A selection made while the session is still resolving must survive a
      // refresh. A pre-auth tab is stored under the owner it is currently
      // scoped to; an owner change replaces it on resolution.
      const stored: TabThread = {
        ...tab,
        owner: tab.owner === PENDING ? owner : tab.owner,
      };
      delete stored.restored;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch { /* no storage */ }
  }, [tab, owner, ready]);

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
    // Only a pending restoration must block a selection. A fresh tab can record
    // one immediately; the pending->owner resolution keeps it.
    if (!ready && restoringSavedThread) return;
    const applies = (old: TabThread | null) =>
      Boolean(old && (old.owner === owner || old.owner === PENDING));
    if (typeof value === "function") {
      // Derived updates (and popstate) never add a history step of their own.
      setTab((old) => (applies(old)
        ? { ...old, activeThreadId: value(old.activeThreadId) } : old));
      return;
    }
    // A direct selection becomes one Back/Forward step. Doing it here keeps the
    // rail on the same public contract it had before SAN-1413 (setActiveThreadId
    // + stopActiveRun), so both behaviours compose.
    recordSelection(owner, value ?? null, true);
    setTab((old) => (applies(old) ? { ...old, activeThreadId: value } : old));
  }, [owner, ready, restoringSavedThread]);

  const selectSavedThread = useCallback((id: string) => {
    if (!UUID.test(id)) return;
    setActiveThreadId(id);
  }, [setActiveThreadId]);

  const clearActiveThread = useCallback(() => {
    // New Chat is a deliberate discard, even if a stored selection is still
    // waiting for auth. Never resurrect that conversation after auth settles.
    setRestoreDismissed(true);
    recordSelection(owner, null, true);
    setTab({ owner: ready ? owner : PENDING, sessionThreadId: crypto.randomUUID() });
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
    sessionThreadId: tab.sessionThreadId,
    // A selection made on this page before auth resolved is this tab's own and
    // safe to show. Anything from a previous owner stays hidden until resolved.
    activeThreadId: ready || (!restoringSavedThread && tab.owner === PENDING)
      ? tab.activeThreadId : undefined,
    hasPersistedThread: Boolean(ready && (tab.activeThreadId || tab.savedThreadId === tab.sessionThreadId)),
    restoredThread: Boolean(ready && tab.restored && tab.savedThreadId === tab.sessionThreadId),
    restoringSavedThread,
    setActiveThreadId, selectSavedThread, markThreadSaved, clearActiveThread, newChatCount,
  }), [ready, tab, restoringSavedThread, setActiveThreadId, selectSavedThread, markThreadSaved, clearActiveThread, newChatCount]);

  // Never replace the app shell while auth loads: the server-rendered chat and
  // its disabled composer must stay on screen (SAN-1413 / SAN-407).
  return (
    <ThreadNavContext.Provider value={value}>
      {children}
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
