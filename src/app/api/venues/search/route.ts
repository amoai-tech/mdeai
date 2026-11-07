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
/** Words that carry no venue signal; matching on them would make every query "succeed". */
const STOPWORDS = new Set([
  "a", "an", "the", "in", "of", "with", "for", "and", "or", "near", "around",
  "some", "any", "best", "good", "nice", "place", "places", "venue", "venues",
  "cafe", "cafes", "café", "cafés", "coffee", "nightlife", "nightclub", "club", "clubs",
]);

/**
 * Keep only rows the query actually describes.
 *
 * The browse retrieval ranks a page of active anchors; it does not filter by text. Reporting those
 * ranks as "matches" would claim relevance the data does not have, and would make an honest empty
 * answer impossible ("zzz" would still return a full page). Token overlap on the real row fields is
 * the smallest truthful filter: no new retrieval engine, and every exclusion is explainable.
 */
// Locale-aware word boundaries and literal string comparisons avoid constructing regexes from guest input.
const wordSegmenter = new Intl.Segmenter("es", { granularity: "word" });

/** Fold Spanish accents, including ñ, so mobile queries without diacritics still match. */
function foldSearchText(value: string): string {
  let plain = "";
  for (const char of value.normalize("NFD")) {
    const point = char.codePointAt(0) ?? 0;
    if (point < 0x0300 || point > 0x036f) plain += char;
  }
  return plain.toLowerCase();
}

function searchWords(value: string): string[] {
  return Array.from(wordSegmenter.segment(foldSearchText(value)))
    .filter((part) => part.isWordLike)
    .map((part) => part.segment);
}

function matchesQuery(row: VenueAnchorRow, queryText: string): boolean {
  const haystack = foldSearchText(
    [row.name, row.neighborhood ?? "", (row.tags ?? []).join(" "), venueAnchorSummary(row) ?? ""].join(" "),
  );
  const tokens = searchWords(queryText)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  if (tokens.length === 0) return true; // no meaningful venue terms to filter on
  const words = new Set(searchWords(haystack));
  return tokens.some((token) =>
    // Short terms must match a whole word: "all" must not match inside "Calle".
    token.length >= 4 ? haystack.includes(token) : words.has(token),
  );
}

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
  // The browse retrieval reads a bounded window (limit * 3, no ORDER BY) and slices to `limit`
  // *before* returning, so filtering that slice would report "no matches" for a row that simply
  // fell outside an arbitrary window. Ask for a much wider candidate set, filter it, then apply the
  // caller's limit. 60 covers the whole current catalogue (17 cafés, 13 nightlife venues); if the
  // catalogue outgrows it, the honest next step is a text predicate in the retrieval itself.
  const candidateLimit = Math.max(limit * 5, 60);
  const { rows, error } =
    kind === "cafe"
      ? await searchCafeVenueAnchorsForBrowse({ neighborhood, limit: candidateLimit, queryText })
      : await searchNightclubVenueAnchorsForBrowse({ neighborhood, limit: candidateLimit, queryText });

  // A retrieval failure must not be reported as "no venues match".
  if (error) {
    return NextResponse.json({ error }, { status: 503 });
  }

  const matched = (queryText ? rows.filter((row) => matchesQuery(row, queryText)) : rows).slice(0, limit);

  return NextResponse.json({
    kind,
    results: matched.map(toGroundedRow),
    total: matched.length,
    source: "venue_anchors",
  });
}
