import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const buckets = new Map<string, number[]>();

export function allowRate(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  let stamps = buckets.get(key) ?? [];
  stamps = stamps.filter((t) => t > windowStart);
  if (stamps.length >= max) return false;
  stamps.push(now);
  buckets.set(key, stamps);
  return true;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  max: number;
  retry_after_seconds: number;
}

/**
 * Durable rate limit. Callers that guard a security-sensitive action (voting, nonce
 * issuance) pass failClosed: true so a database problem denies the request instead of
 * silently lifting the limit. Default stays fail-open for non-critical callers.
 */
export async function allowRateDurable(
  supabase: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
  opts: { failClosed?: boolean } = {},
): Promise<RateLimitResult> {
  const denied: RateLimitResult = { allowed: false, count: 0, max, retry_after_seconds: windowSeconds };
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("allowRateDurable: RPC error:", error.message ?? error, opts.failClosed ? "(failing closed)" : "(failing open)");
    return opts.failClosed ? denied : { allowed: true, count: 0, max, retry_after_seconds: 0 };
  }
  const result = data as RateLimitResult | null;
  if (!result) return opts.failClosed ? denied : { allowed: true, count: 0, max, retry_after_seconds: 0 };
  return result;
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}
