/** VERCEL-CPU-001 — in-process IP rate limits for public API hot paths (Vercel Fluid CPU). */
import { NextResponse } from "next/server";
import { createPlacesRateLimiter } from "@/lib/places-rate-limiter";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/distributed-rate-limit";

const searchFastPathLimiter = createPlacesRateLimiter(30);
const groundingLimiter = createPlacesRateLimiter(15);
/** Legacy in-process CopilotKit buckets — superseded by PERF-001b · Distributed CopilotKit rate limit (Jun 12 flood fix) on route. */
const copilotKitIpGateLimiter = createPlacesRateLimiter(60);
const copilotKitAnonLimiter = createPlacesRateLimiter(15);
const copilotKitAuthedLimiter = createPlacesRateLimiter(40);

export function rateLimitedResponse(): NextResponse {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Public search, limited by a shared Postgres store so the number means the same thing on every
 * Vercel instance.
 *
 * Falls back to the in-process bucket when the store is unavailable: a rate limiter must not turn
 * a database hiccup into a broken search box. `storeAvailable` is what distinguishes the two.
 */
/** How long the shared limiter may delay a public search before we fall back. */
const SHARED_LIMIT_TIMEOUT_MS = 400;

/**
 * Rate-limits a public search request against a store every instance shares.
 *
 * @param req Incoming request; its client IP is the bucket key.
 * @param bucket Logical limiter name, so one route cannot exhaust another's allowance.
 * @param max Requests allowed per window.
 * @param windowSeconds Window length in seconds.
 * @returns A ready 429 response when the visitor is over the limit, otherwise null.
 */
export async function checkSearchFastPathSharedRateLimit(
  req: Request,
  bucket: string,
  max = 30,
  windowSeconds = 60,
): Promise<NextResponse | null> {
  const ip = clientIpFromRequest(req);
  let result: Awaited<ReturnType<typeof checkRateLimitDurable>> | null = null;
  try {
    // A stalled RPC must not hold the request open: past the budget the in-process bucket applies.
    // The installed supabase-js (v2, this pin) offers no abort option on `rpc()` — the published
    // `.abortSignal()` guidance applies to a newer client — so this bounds the wait, not the query.
    // The abandoned call finishes harmlessly and its result is discarded.
    result = await Promise.race([
      checkRateLimitDurable(`${bucket}:ip:${ip}`, max, windowSeconds),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SHARED_LIMIT_TIMEOUT_MS)),
    ]);
  } catch {
    result = null;
  }
  if (!result || !result.storeAvailable) {
    // Shared limit unavailable — keep the fast in-process guard so the route is never unprotected.
    return checkSearchFastPathRateLimit(req);
  }
  return result.allowed ? null : rateLimitedResponse();
}

/** Public POST fast paths: /api/events/search, /api/rentals/search, etc. */
export function checkSearchFastPathRateLimit(req: Request): NextResponse | null {
  const key = searchFastPathLimiter.rateLimitKey(req);
  if (searchFastPathLimiter.isRateLimited(key)) return rateLimitedResponse();
  return null;
}

export function checkGroundingRouteRateLimit(req: Request): NextResponse | null {
  const key = groundingLimiter.rateLimitKey(req);
  if (groundingLimiter.isRateLimited(key)) return rateLimitedResponse();
  return null;
}

/** Runs before auth I/O — blocks IP floods from reaching Supabase getUser. */
export function checkCopilotKitIpGate(req: Request): Response | null {
  const key = `gate:${copilotKitIpGateLimiter.rateLimitKey(req)}`;
  if (copilotKitIpGateLimiter.isRateLimited(key)) {
    return new Response("Too Many Requests", { status: 429 });
  }
  return null;
}

/** CopilotKit — tighter for anonymous IPs; higher bucket when session exists. */
export function checkCopilotKitRateLimit(
  req: Request,
  userId: string | null,
): Response | null {
  const ip = copilotKitAnonLimiter.rateLimitKey(req);
  if (userId) {
    const key = `auth:${userId}`;
    if (copilotKitAuthedLimiter.isRateLimited(key)) {
      return new Response("Too Many Requests", { status: 429 });
    }
    return null;
  }
  const key = `anon:${ip}`;
  if (copilotKitAnonLimiter.isRateLimited(key)) {
    return new Response("Too Many Requests", { status: 429 });
  }
  return null;
}

export const resetApiIpRateLimitsForTests = (): void => {
  searchFastPathLimiter.resetForTests();
  groundingLimiter.resetForTests();
  copilotKitIpGateLimiter.resetForTests();
  copilotKitAnonLimiter.resetForTests();
  copilotKitAuthedLimiter.resetForTests();
};
