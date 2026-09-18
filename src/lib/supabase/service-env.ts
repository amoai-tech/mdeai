import { getSupabaseServerUrl } from "./server-env";

/**
 * Server-only Supabase credentials for privileged writes (e.g. ai_runs).
 * Never import from client components or expose via NEXT_PUBLIC_*.
 */
export function getSupabaseServiceEnv(): {
  url: string;
  serviceRoleKey: string;
} | null {
  const url = getSupabaseServerUrl();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}
