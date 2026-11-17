import { z } from "zod";
import { hasExplicitPlaceScope } from "./google-places-cafe-search";

const CAFE_QUERY =
  /\b(caf[eé]s?|cafeter[ií]as?|coffee shops?|quiet caf[eé]s?|top cafes?|list cafes?|coworking|wifi|wi-fi|laptop[- ]friendly)\b/i;

const NIGHTLIFE_QUERY =
  /\b(nightlife|salsa bars?|hidden bars?|rooftop cocktails?|rooftop bars?|live music bars?|locals go to)\b/i;

export function isCafeGroundingQuery(query: string): boolean {
  return CAFE_QUERY.test(query);
}

export function isNightlifeGroundingQuery(query: string): boolean {
  return NIGHTLIFE_QUERY.test(query);
}

export function normalizeVenueGroundingQuery(
  query: string,
  options?: { hasViewportBias?: boolean },
): string {
  const q = query.trim();
  const destination =
    hasExplicitPlaceScope(q) || options?.hasViewportBias
      ? ""
      : " in Medellín";
  if (isCafeGroundingQuery(q)) {
    if (/\b(wifi|wi-fi|laptop|cowork|remote work)\b/i.test(q)) {
      return `${q}. Prefer cafés with reliable Wi-Fi, power outlets, and laptop-friendly seating${destination}. Exclude bars and nightclubs.`;
    }
    return `${q}. Prefer specialty coffee roasters and brunch cafés${destination}. Exclude bar lounges and nightlife venues.`;
  }
  if (isNightlifeGroundingQuery(q)) {
    if (/\bsalsa\b/i.test(q)) {
      return `${q}. Prefer authentic salsa bars and live salsa venues locals visit${destination}. Exclude generic tourist clubs.`;
    }
    if (/\brooftop\b/i.test(q)) {
      return `${q}. Prefer rooftop bars and cocktail terraces with views${destination}.`;
    }
    return `${q}. Prefer nightlife venues and bars locals recommend${destination}.`;
  }
  return q;
}

export function isCafeGroundingIntent(
  query: string,
  intent?: string,
): boolean {
  if (intent === "cafe") return true;
  if (intent === "nightlife") return false;
  return isCafeGroundingQuery(query);
}

export function isNightlifeGroundingIntent(
  query: string,
  intent?: string,
): boolean {
  if (intent === "nightlife") return true;
  return isNightlifeGroundingQuery(query);
}

export const venueGroundingIntentSchema = z.enum([
  "cafe",
  "general",
  "nightlife",
]);

export type VenueGroundingIntent = z.infer<typeof venueGroundingIntentSchema>;
export type VenueGroundingKind = VenueGroundingIntent;

export function resolveVenueGroundingKind(
  query: string,
  intent?: VenueGroundingIntent,
): VenueGroundingKind {
  if (intent === "nightlife" || intent === "cafe" || intent === "general") {
    return intent;
  }
  if (isNightlifeGroundingQuery(query)) return "nightlife";
  if (isCafeGroundingQuery(query)) return "cafe";
  return "general";
}
