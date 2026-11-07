import { NextResponse } from "next/server";
import { hasPlacesApiKey } from "@/mastra/lib/google-places-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Release-gate health probe. Booleans only: this endpoint must never expose a
 * key, URL, project ref or any other configuration value.
 *
 * `ok` is the subset a production release cannot work without: a server Places
 * key, a configured Map ID, and Supabase. The sidecar is reported but does not
 * fail the release because grounded search has an honest degraded path.
 */
export async function GET() {
  const checks = {
    placesKey: hasPlacesApiKey(),
    mapId: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim()),
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    ),
    sidecar: Boolean(process.env.ADK_GROUNDING_URL?.trim()),
  };
  const ok = checks.placesKey && checks.mapId && checks.supabase;

  return NextResponse.json(
    {
      ok,
      checks,
      environment:
        process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
