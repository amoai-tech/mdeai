import { withMapCoverage } from "@/lib/map-result-summary";
import { analyzeVenueIntelligenceQuery } from "@/mastra/lib/intelligence-restaurant-venue-wrapper";

export type CafeSearchApiParams = {
  query: string;
  neighborhood?: string;
  limit?: number;
  intent?: "cafe" | "nightlife";
};

const FAST_PATH_LIMIT = 5;

/**
 * A question about the results already on screen is not a new search.
 *
 * "Which of these cafés would you recommend for working with a laptop?" contains
 * "cafés", but re-running the café search discards the conversation and returns
 * the same cards instead of an answer. Leaving these to the agent keeps thread
 * context and gives a recommendation rather than a duplicate result set.
 */
const CONTEXTUAL_FOLLOW_UP_PATTERNS = [
  /\b(?:which|what)\s+(?:of\s+)?(?:these|those|them)\b/i,
  /\b(?:of|among)\s+(?:these|those)\b/i,
  /\bwould you recommend\b/i,
  /\bwhich one\b/i,
  /\b(?:the\s+)?(?:first|second|third|last)\s+(?:one|option)\b/i,
  /\b(?:the\s+)?best\s+(?:one|option)\b/i,
];

export function isContextualVenueFollowUp(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return CONTEXTUAL_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function buildCafeSearchParams(text: string): CafeSearchApiParams | null {
  const trimmed = text.trim();
  // Do not treat a follow-up about the current cards as a fresh venue search.
  if (isContextualVenueFollowUp(trimmed)) return null;
  const analysis = analyzeVenueIntelligenceQuery(trimmed);
  if (analysis.action !== "search_now") return null;
  if (analysis.route === "nightlife_anchor") {
    return {
      query: analysis.slots.queryText,
      neighborhood: analysis.slots.neighborhood,
      limit: FAST_PATH_LIMIT,
      intent: "nightlife",
    };
  }
  if (analysis.route === "cafe_anchor") {
    return {
      query: analysis.slots.queryText,
      neighborhood: analysis.slots.neighborhood,
      limit: FAST_PATH_LIMIT,
      intent: "cafe",
    };
  }
  return null;
}

export function canFastPathCafeSearch(text: string): boolean {
  return buildCafeSearchParams(text) != null;
}

export function fastPathCafeSummary(
  count: number,
  pinCount: number,
  neighborhood?: string,
  query?: string,
): string {
  if (count === 0) {
    if (query && analyzeVenueIntelligenceQuery(query).route === "nightlife_anchor") {
      return "No nightlife venues matched — try salsa bars, rooftops, or another neighborhood.";
    }
    return "No cafés matched — try another neighborhood or phrasing.";
  }
  const area = neighborhood ? ` in the ${neighborhood} area` : " in Medellín";
  if (query && analyzeVenueIntelligenceQuery(query).route === "nightlife_anchor") {
    return withMapCoverage(`Found ${count} nightlife venue${count === 1 ? "" : "s"}${area}`, count, pinCount);
  }
  return withMapCoverage(`Found ${count} specialty coffee shop${count === 1 ? "" : "s"}${area}`, count, pinCount);
}
