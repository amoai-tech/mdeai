import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerAnonEnv } from "./server-env";

/** AUTH-006 — RLS-scoped reads/writes using the user's access token (preferred over manual Authorization header). */
export function createUserScopedClient(accessToken: string) {
  const env = getSupabaseServerAnonEnv();
  if (!env) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_ANON_KEY for user-scoped client",
    );
  }
  return createClient(env.url, env.anonKey, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
