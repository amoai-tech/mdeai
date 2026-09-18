import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerAnonEnv } from "./server-env";

/** AUTH-006 — RLS-scoped reads/writes using the user's access token (preferred over manual Authorization header). */
export function createUserScopedClient(accessToken: string) {
  const env = getSupabaseServerAnonEnv();
  if (!env) {
    throw new Error(
      "Missing Supabase server credentials for user-scoped client: set SUPABASE_URL or " +
        "NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createClient(env.url, env.anonKey, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
