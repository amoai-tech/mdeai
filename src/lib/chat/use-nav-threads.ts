"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NavThread } from "@/app/api/threads/route";
import { subscribeThreadListChanged } from "@/lib/chat/thread-list-events";

export type { NavThread };

export function useNavThreads() {
  const [threads, setThreads] = useState<NavThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);
  // Each refresh gets a number. Only the newest one may change state, so a slow older response
  // (two quick messages in a row) can never put a stale title or order back on screen.
  const latestRequestRef = useRef(0);

  // `quiet`: refresh the list without blanking it with the loading skeleton. Used when the list
  // changed because of the chat the user is in (a new title, a new message).
  const refresh = useCallback(async (options?: { quiet?: boolean }) => {
    const request = ++latestRequestRef.current;
    const isLatest = () => request === latestRequestRef.current;
    if (!options?.quiet) setLoading(true);
    setError(false);
    try {
      const r = await fetch("/api/threads");
      if (!r.ok) throw new Error(`/api/threads ${r.status}`);
      const d = (await r.json()) as { threads: NavThread[] };
      if (isLatest()) setThreads(d.threads ?? []);
    } catch {
      // A failed quiet refresh keeps the list the user already sees instead of replacing it with an error.
      if (!options?.quiet && isLatest()) setError(true);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    refresh();
  }, [refresh]);

  // SAN-1412: a chat got a title or a new message → refetch. No polling.
  useEffect(() => subscribeThreadListChanged(() => void refresh({ quiet: true })), [refresh]);

  return { threads, loading, error, refresh };
}
