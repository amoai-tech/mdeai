import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Public, non-secret readiness flags for the release smoke.
 * Presence is not provider availability: the post-deploy Nearby test still has
 * to call Google Places for real and prove authenticated access succeeds.
 */
export function GET() {
  // Match the Places client's precedence: an empty primary key must not appear healthy
  // just because a fallback is populated.
  const placesKey = process.env.GOOGLE_PLACES_API_KEY ??
    process.env.GOOGLE_MAPS_SERVER_API_KEY ??
    process.env.GOOGLE_MAPS_API_KEY;

  const checks = {
    deploymentConfigured: Boolean(process.env.VERCEL_GIT_COMMIT_SHA?.trim()),
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
      Boolean((process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()),
    placesConfigured: Boolean(placesKey?.trim()),
  };
  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { ok, checks },
    { status: ok ? 200 : 503, headers: NO_STORE },
  );
}
