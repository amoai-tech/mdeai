"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let authRevision = 0;

    // Subscribe first so an actual sign-in/sign-out cannot be lost while getUser runs.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || event === "INITIAL_SESSION") return;
      authRevision++;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const initialRevision = authRevision;
    void supabase.auth.getUser()
      .then(({ data, error }) => {
        // Never let the older initial read undo a newer auth event.
        if (!mounted || authRevision !== initialRevision) return;
        setUser(error ? null : data.user);
        setLoading(false);
      })
      .catch(() => {
        // A failed initial lookup must not hide guest navigation forever.
        if (!mounted || authRevision !== initialRevision) return;
        setUser(null);
        setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
