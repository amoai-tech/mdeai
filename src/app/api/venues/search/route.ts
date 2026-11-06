import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSearchFastPathRateLimit } from "@/lib/api-ip-rate-limit";
import {
  searchCafeVenueAnchorsForBrowse,
  searchNightclubVenueAnchorsForBrowse,
  venueAnchorMapsUrl,
  venueAnchorSummary,
  venueAnchorToCoordinates,
  type VenueAnchorRow,
} from "@/mastra/tools/search-venue-anchors";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";

/**
 * Public catalogue search for cafés and nightlife, for visitors without an account.
 *
 * Cafés and nightlife are **venue anchors**, not the restaurant catalogue: different table,
 * different retrieval, different ranking. This route therefore calls the same browse functions the
 * signed page uses, and never touches the restaurant search path. Results are shaped like the rows
 * the existing grounded-results list already renders, so a guest search lights up the same cards,
 * map pins and Details panel as an Ask MDE answer — without reaching the agent runtime.
 *
 * Truthfulness rules: a retrieval failure is a 503 (never an empty list pretending "no matches"),
 * unknown fields stay absent, and no coordinates, amenities or prices are invented.
 */
const bodySchema = z.object({
  kind: z.enum(["cafe", "nightlife"]),
  queryText: z.string().trim().min(1).max(120).optional(),
  neighborhood: z.string().trim().min(1).max(60).optional(),
  limit: z.number().int().min(1).max(20).optional().default(12),
});

function toGroundedRow(row: VenueAnchorRow): GroundedToolRow {
  const coords = venueAnchorToCoordinates(row);
  return {
    id: row.id,
    title: row.name,
    ...(row.google_place_id ? { placeId: row.google_place_id } : {}),
    mapsUrl: venueAnchorMapsUrl(row.google_place_id),
    ...(coords.latitude != null ? { latitude: coords.latitude } : {}),
    ...(coords.longitude != null ? { longitude: coords.longitude } : {}),
    ...(venueAnchorSummary(row) ? { summary: venueAnchorSummary(row) ?? undefined } : {}),
    ...(row.neighborhood ? { formattedAddress: row.neighborhood } : {}),
  };
}

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

  const { kind, queryText, neighborhood, limit } = parsed.data;
  const { rows, error } =
    kind === "cafe"
      ? await searchCafeVenueAnchorsForBrowse({ neighborhood, limit, queryText })
      : await searchNightclubVenueAnchorsForBrowse({ neighborhood, limit, queryText });

  // A retrieval failure must not be reported as "no venues match".
  if (error) {
    return NextResponse.json({ error }, { status: 503 });
  }

  return NextResponse.json({
    kind,
    results: rows.map(toGroundedRow),
    total: rows.length,
    source: "venue_anchors",
  });
}
