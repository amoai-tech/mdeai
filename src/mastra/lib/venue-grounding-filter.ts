import type { GroundedPlaceResult } from "./map-adk-grounding-pins";
import {
  isCafeGroundingIntent,
  isNightlifeGroundingIntent,
  normalizeVenueGroundingQuery,
} from "./venue-grounding-intent";

function isNightlifeCandidateTitle(title: string): boolean {
  return /\b(bar|club|salsa|rooftop|nightlife|discotec|lounge|cocktail|night)\b/i.test(
    title,
  );
}

export function filterNightlifeGroundingRows(
  rows: GroundedPlaceResult[],
  query: string,
  intent?: string,
): GroundedPlaceResult[] {
  if (!isNightlifeGroundingIntent(query, intent)) return rows;
  const nightlife = rows.filter(
    (row) =>
      isNightlifeCandidateTitle(row.title) && !isBarLoungeDistractor(row.title),
  );
  return nightlife.length > 0 ? nightlife : rows;
}

export function normalizeCafeGroundingQuery(
  query: string,
  options?: { hasViewportBias?: boolean },
): string {
  return normalizeVenueGroundingQuery(query, options);
}

function isBarLoungeDistractor(title: string): boolean {
  if (/\bskybar\b/i.test(title)) return true;
  if (/\bbar\s*&\s*lounge\b/i.test(title)) return true;
  if (/general cafe bar/i.test(title)) return true;
  if (/\bcaf[eé]\s+noir\s+bar/i.test(title)) return true;
  return false;
}

function isCafeCandidateTitle(title: string): boolean {
  return /\bcaf[eé]|cafeter[ií]a|coffee|brunch/i.test(title);
}

export function filterCafeGroundingRows(
  rows: GroundedPlaceResult[],
  query: string,
  intent?: string,
): GroundedPlaceResult[] {
  if (!isCafeGroundingIntent(query, intent)) return rows;
  return rows.filter((row) => {
    if (isBarLoungeDistractor(row.title)) return false;
    if (/^(cafe|coffee_shop|bakery|brunch_restaurant)$/i.test(row.primaryType ?? "")) {
      return true;
    }
    return isCafeCandidateTitle(row.title);
  });
}
