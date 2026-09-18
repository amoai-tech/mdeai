/**
 * MDE-ENV-002 (SAN-1333) — canonical server-side Supabase credentials.
 *
 * Why this exists
 * ---------------
 * Vercel injects `NEXT_PUBLIC_SUPABASE_URL` (plus a publishable/anon key) but
 * never a bare `SUPABASE_URL`. Server modules that read only
 * `process.env.SUPABASE_URL` therefore got `undefined`, returned a `null`
 * client, and degraded silently: every concierge vertical served fixture data
 * behind HTTP 200, the `/chat` `rental-card` step never rendered, and
 * `search_logs` went dark.
 *
 * Production runtime logs proved it (deployment dpl_79QosuJ3cgapCG7TrHY7MMBYro1V):
 *
 *   [search-rentals] Supabase query failed, falling back to mock: Supabase client unavailable
 *
 * The public names are safe to read on the server — they are already compiled
 * into the browser bundle by design — so server code accepts either name. This
 * mirrors the fallback that `service-env.ts` and `user-scoped.ts` already used.
 *
 * Blank values
 * ------------
 * `??` is not sufficient for a fallback chain fed by Vercel. A Sensitive variable
 * can be present with an *empty* value, and `"" ?? fallback` returns `""`, which
 * is falsy — so the chain stops on a blank instead of falling through to a
 * usable value. That is exactly how the first version of this module still
 * returned `null` in production: `SUPABASE_ANON_KEY` exists in Vercel with an
 * empty value, so the inlined publishable key was never reached and every
 * search kept serving fixtures behind HTTP 200.
 *
 * `firstPresent` therefore skips blank and whitespace-only values, matching the
 * `DATABASE_URL` hardening in `src/mastra/lib/storage.ts`.
 *
 * Server-only: do not import from client components.
 */

/** First candidate that is actually present, trimmed; blank counts as absent. */
export function firstPresent(
  ...candidates: (string | undefined)[]
): string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Server-only name first, then the name Vercel actually injects. */
export function getSupabaseServerUrl(): string | undefined {
  return firstPresent(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Preferred publishable key first, then the legacy anon JWT names — matching
 * `getSupabaseEnv()` in `env.ts` and `service-env.ts`.
 */
export function getSupabaseServerAnonKey(): string | undefined {
  return firstPresent(
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Soft accessor for tools that keep working (mock/empty) when credentials are
 * absent. Callers must handle `null` explicitly rather than assume success.
 */
export function getSupabaseServerAnonEnv(): {
  url: string;
  anonKey: string;
} | null {
  const url = getSupabaseServerUrl();
  const anonKey = getSupabaseServerAnonKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
