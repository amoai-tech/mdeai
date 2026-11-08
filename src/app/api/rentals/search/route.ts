import { NextResponse } from "next/server";
import { checkSearchFastPathRateLimit } from "@/lib/api-ip-rate-limit";
import { rentalSearchBodySchema } from "@/lib/rental-search-body-schema";
import {
  describeRentalSearchError,
  isRentalSearchUnavailable,
} from "@/mastra/lib/rental-search-unavailable";
import { searchRentals } from "@/mastra/tools/search-rentals";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Fast path — rental search without conciergeAgent round-trip. */
export async function POST(req: Request) {
  const rateLimited = checkSearchFastPathRateLimit(req);
  if (rateLimited) return rateLimited;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = rentalSearchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { neighborhood, minBedrooms, maxBedrooms, maxPricePerNight, maxPriceMonthly, budgetCurrency, limit, queryText, checkIn, checkOut, stayType } = parsed.data;
  try {
    // SAN-1502 PR2: the caller's own RLS-governed client, so an authorized test
    // actor's results include published development fixtures and no one else's do.
    const supabase = await createClient();
    const {
      results,
      total,
      source,
      budgetNote,
      hybridUsed,
      embedStatus,
      embedFailureReason,
      embedHttpStatus,
      rankExplanation,
    } = await searchRentals({
      neighborhood,
      minBedrooms,
      maxBedrooms,
      maxPricePerNight,
      maxPriceMonthly,
      budgetCurrency,
      limit,
      queryText,
      checkIn,
      checkOut,
      stayType,
    }, { client: supabase });
    return NextResponse.json({
      results,
      total,
      source,
      budgetNote,
      hybridUsed,
      embedStatus,
      embedFailureReason,
      embedHttpStatus,
      rankExplanation,
    });
  } catch (error) {
    // SAN-1089: an unreadable database is 503, never `200 + results: []`. The chat fast path
    // and /rentals key off the status to tell "search unavailable" from "no rentals match".
    if (isRentalSearchUnavailable(error)) {
      console.error("[api/rentals/search] unavailable:", error.reason);
      return NextResponse.json(
        {
          error: "rental_search_unavailable",
          message: "Rental search is temporarily unavailable. Please try again.",
        },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    console.error("[api/rentals/search]", describeRentalSearchError(error));
    return NextResponse.json(
      {
        error: "rental_search_failed",
        message: "Unable to search rentals right now.",
      },
      { status: 500 },
    );
  }
}
