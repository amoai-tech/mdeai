import { NextResponse } from "next/server";
import { hasPlacesApiKey } from "@/mastra/lib/google-places-client";
import { hasConfiguredMapId } from "@/lib/google-maps-map-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Release-gate health probe. Booleans only: this endpoint must never expose a
 * key, URL, project ref or the deployment environment.
 *
 * `ok` is the subset a production release cannot work without: a server Places
 * key, a usable browser Maps key, a real Map ID (not `DEMO_MAP_ID`), and
 * Supabase. The sidecar is reported but does not fail the release because
 * grounded search has an honest degraded path.
 */
export async function GET() {
  const supabaseKey =
    (configured(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
      ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      : undefined) ??
    (configured(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : undefined);

  const checks = {
    placesKey: hasPlacesApiKey(),
    mapId: hasConfiguredMapId(),
    mapsKey: configured(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    supabase:
      configured(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(supabaseKey),
    sidecar: configured(process.env.ADK_GROUNDING_URL),
  };
  const ok =
    checks.placesKey && checks.mapId && checks.mapsKey && checks.supabase;

  return NextResponse.json(
    { ok, checks },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
