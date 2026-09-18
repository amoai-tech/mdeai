/**
 * Shared gate for the live Supabase ranking suites (SAN-1314).
 *
 * `anchor-ranking.integration.test.ts` and `search-003-ranking.integration.test.ts`
 * exercise code that builds its Supabase client from the server-only
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` contract — neither reads `NEXT_PUBLIC_*`.
 *
 * Gating on `NEXT_PUBLIC_*` (as these suites originally did) let the required,
 * deterministic Floor check run live production queries whenever any public key
 * secret happened to be present in the workflow env. The client then silently
 * resolved to `null`, every query returned zero rows / `source: "fallback"`, and
 * Floor failed with "expected 0 to be greater than or equal to N" — an environment
 * mismatch masquerading as a ranking regression.
 *
 * Live certification therefore requires BOTH:
 *   1. the server-only credentials the code under test actually reads, and
 *   2. an explicit `LIVE_SUPABASE_TESTS=1` opt-in.
 *
 * `npm test` / Floor never sets the opt-in, so those checks stay deterministic and
 * independent of mutable production rows. `.github/workflows/live-integration.yml`
 * runs the same suites separately, against the real project.
 *
 * The contract is pinned by the deterministic "live Supabase integration env gate"
 * assertions in `search-003-ranking.integration.test.ts`, so a future workflow env
 * change cannot silently re-activate live production queries inside Floor.
 */
export function hasLiveSupabase(): boolean {
  return (
    process.env.LIVE_SUPABASE_TESTS === "1" &&
    Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  );
}
