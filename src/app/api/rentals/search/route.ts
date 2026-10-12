import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSearchFastPathRateLimit } from "@/lib/api-ip-rate-limit";
import {
  describeRentalSearchError,
  isRentalSearchUnavailable,
} from "@/mastra/lib/rental-search-unavailable";
import { searchRentals } from "@/mastra/tools/search-rentals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const bodySchema = z.object({
  neighborhood: z.string().optional(),
  minBedrooms: z.number().int().min(0).optional(),
  maxPricePerNight: z.number().positive().optional(),
  limit: z.number().int().min(1).max(20).optional().default(8),
  queryText: z.string().optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stayType: z.enum(["nightly", "monthly", "total_trip"]).optional(),
});

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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { neighborhood, minBedrooms, maxPricePerNight, limit, queryText, checkIn, checkOut, stayType } = parsed.data;
  try {
    const {
      results,
      total,
      source,
      hybridUsed,
      embedStatus,
      embedFailureReason,
      embedHttpStatus,
      rankExplanation,
    } = await searchRentals({
      neighborhood,
      minBedrooms,
      maxPricePerNight,
      limit,
      queryText,
      checkIn,
      checkOut,
      stayType,
    });
    return NextResponse.json({
      results,
      total,
      source,
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
