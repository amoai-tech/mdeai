/**
 * First candidate that is actually present, trimmed; blank counts as absent.
 *
 * Why this exists instead of `??`
 * -------------------------------
 * `??` only skips `null` and `undefined`. A Vercel environment variable can be
 * present with an **empty** value (a Sensitive variable created without a value,
 * for example), and `"" ?? fallback` returns `""` — so a fallback chain stops on
 * a blank instead of reaching a usable value. That is exactly how production kept
 * serving fixture data behind HTTP 200 after the first SAN-1333 fix:
 * `SUPABASE_ANON_KEY` existed with an empty value, so the inlined publishable key
 * was never reached and the Supabase client was always `null`.
 *
 * Deliberately pure: no imports and no `process.env` access, so it is safe to use
 * from client, server, and edge code alike.
 */
export function firstPresent(
  ...candidates: (string | undefined)[]
): string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}
