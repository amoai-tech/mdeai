import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceEnv } from "@/lib/supabase/service-env";

const DEFAULT_DAILY_CAP = 200;

export type GroundingQuotaResult =
  | { allowed: true }
  | { allowed: false; reason: "quota" | "disabled" | "quota_unavailable" };

/**
 * Reserve one paid provider call atomically before it is issued.
 * No database/service key => fail closed when a cap is configured; dev without
 * Supabase still runs so local development does not need production secrets.
 */
export async function incrementAndCheckGroundingQuota(): Promise<GroundingQuotaResult> {
  const limitRaw = process.env.MAPS_GROUNDING_DAILY_LIMIT;
  if (limitRaw === "0") {
    return { allowed: false, reason: "disabled" };
  }
  const dailyCap = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_DAILY_CAP;
  if (!Number.isFinite(dailyCap) || dailyCap <= 0) {
    return { allowed: false, reason: "disabled" };
  }

  const env = getSupabaseServiceEnv();
  if (!env) {
    return { allowed: false, reason: "quota_unavailable" };
  }

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.rpc("reserve_places_grounding_quota", {
      p_daily_cap: dailyCap,
    });
    if (error || typeof data !== "boolean") {
      console.warn("[grounding-quota] atomic reserve unavailable", error?.message);
      return { allowed: false, reason: "quota_unavailable" };
    }
    return data ? { allowed: true } : { allowed: false, reason: "quota" };
  } catch {
    return { allowed: false, reason: "quota_unavailable" };
  }
}
