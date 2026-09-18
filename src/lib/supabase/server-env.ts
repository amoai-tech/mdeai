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
 * Server-only: do not import from client components.
 */

/** Server-only name first, then the name Vercel actually injects. */
export function getSupabaseServerUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Preferred publishable key first, then the legacy anon JWT names — matching
 * `getSupabaseEnv()` in `env.ts` and `service-env.ts`.
 */
export function getSupabaseServerAnonKey(): string | undefined {
  return (
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
