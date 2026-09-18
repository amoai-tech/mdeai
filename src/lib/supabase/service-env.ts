import { firstPresent } from "@/lib/first-present";
import { getSupabaseServerUrl } from "./server-env";

/**
 * Server-only Supabase credentials for privileged writes (e.g. ai_runs).
 * Never import from client components or expose via NEXT_PUBLIC_*.
 *
 * Uses `firstPresent` rather than `??` for the same reason as the anon key: a
 * Sensitive variable present with an empty value would otherwise stop the chain
 * and disable privileged writes with no error.
 */
export function getSupabaseServiceEnv(): {
  url: string;
  serviceRoleKey: string;
} | null {
  const url = getSupabaseServerUrl();
  const serviceRoleKey = firstPresent(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
  );
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}
