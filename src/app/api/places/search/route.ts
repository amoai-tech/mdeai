import { NextResponse } from "next/server";
import { searchRentalAddresses } from "@/lib/place-search";
import {
  PlacesConfigError,
  PlacesRequestError,
} from "@/mastra/lib/google-places-client";
import {
  isPlacesSearchRateLimited,
  placesSearchRateLimitKey,
} from "@/lib/places-search-rate-limit";

/**
 * GET /api/places/search?q=… — Places API (New) address candidates for the
 * broker onboarding picker. Server-side only; minimal field mask; rate-limited.
 */
export async function GET(req: Request) {
  const rateKey = placesSearchRateLimitKey(req);
  if (isPlacesSearchRateLimited(rateKey)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 5 || q.length > 200) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  try {
    const results = await searchRentalAddresses(q);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (err) {
    if (err instanceof PlacesConfigError) {
      return NextResponse.json(
        { error: "places_not_configured" },
        { status: 503, headers: { "Cache-Control": "private, max-age=600" } },
      );
    }
    if (err instanceof PlacesRequestError) {
      return NextResponse.json(
        { error: "places_request_failed" },
        { status: 502, headers: { "Cache-Control": "private, max-age=600" } },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
