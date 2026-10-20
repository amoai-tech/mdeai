import { isSearchGroundingEnabled } from "@/lib/is-search-grounding-enabled";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceEnv } from "@/lib/supabase/service-env";

const DEFAULT_DAILY_CAP = 50;

export type SearchGroundingQuotaResult =
  | { allowed: true }
  | { allowed: false; reason: "quota" | "disabled" | "quota_unavailable" };

/**
 * Reserve one Google Search invocation atomically, BEFORE the external call.
 * No database/service key, missing RPC, or DB error => do not spend unmetered calls.
 * The database function increments at most once per concurrent request.
 */
export async function incrementAndCheckSearchGroundingQuota(): Promise<SearchGroundingQuotaResult> {
  if (!isSearchGroundingEnabled()) {
    return { allowed: false, reason: "disabled" };
  }

  const raw = process.env.SEARCH_GROUNDING_DAILY_CAP;
  const dailyCap = raw === undefined ? DEFAULT_DAILY_CAP : Number(raw);
  if (!Number.isSafeInteger(dailyCap) || dailyCap <= 0) {
    return { allowed: false, reason: "disabled" };
  }

  const env = getSupabaseServiceEnv();
  if (!env) {
    console.warn("[search-grounding-quota] Supabase service config unavailable");
    return { allowed: false, reason: "quota_unavailable" };
  }

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.rpc("reserve_search_grounding_quota", {
      p_daily_cap: dailyCap,
    });
    if (error || typeof data !== "boolean") {
      console.warn("[search-grounding-quota] atomic reserve unavailable", error?.message);
      return { allowed: false, reason: "quota_unavailable" };
    }
    return data ? { allowed: true } : { allowed: false, reason: "quota" };
  } catch {
    return { allowed: false, reason: "quota_unavailable" };
  }
}
