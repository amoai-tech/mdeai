import { firstPresent } from "@/lib/first-present";

/**
 * Public Supabase credentials for the browser, middleware and SSR clients.
 *
 * Uses `firstPresent` rather than `??` so a blank `NEXT_PUBLIC_*` value falls
 * through instead of being returned: a Vercel variable can be present with an
 * empty value, and `"" ?? fallback` stops on the blank and throws here, taking
 * down the browser client, the proxy/middleware session refresh and every SSR
 * Supabase call with it.
 */
export function getSupabaseEnv() {
  const url = firstPresent(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Prefer publishable key (sb_publishable_…); fall back to legacy anon JWT (eyJ…)
  const anonKey = firstPresent(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return { url, anonKey };
}
