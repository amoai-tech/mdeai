import { withMapCoverage } from "@/lib/map-result-summary";
import type { ConciergeWorkingMemory } from "@/lib/types";
import type { Restaurant } from "@/mastra/tools/search-restaurants";
import { analyzeVenueIntelligenceQuery } from "@/mastra/lib/intelligence-restaurant-venue-wrapper";
import {
  hasRestaurantFastPathSignals,
  isGenericRestaurantQuery,
  looksLikeRestaurantDiscovery,
  looksLikeNightlifeGroundingSearch,
  looksLikeCafeSearch,
  scoreRestaurantQuery,
} from "@/lib/restaurant-query-classifier";

export type RestaurantSearchApiParams = {
  neighborhood?: string;
  cuisine?: string;
  queryText?: string;
  priceTier?: "$" | "$$" | "$$$" | "$$$$";
  userLatitude?: number;
  userLongitude?: number;
  limit?: number;
};

const FAST_PATH_LIMIT = 5;

/** Booking/action intents must reach the concierge's consent workflow.
 * Search-only fast paths can display cards, but cannot request a table.
 */
function isRestaurantBookingAction(text: string): boolean {
  // A factual lookup followed by "do not book anything" is NOT a booking
  // request. Remove only the negated span; a later positive request still wins.
  const positive = text.replace(
    /\b(?:do\s+not|don't|dont|never|without|no\s+need\s+to)\s+(?:book(?:ing)?|reserv(?:e|ation|ations)|reservar|reserva)(?:\s+(?:anything|a\s+table))?/gi,
    '',
  );
  return /\b(?:book(?:ing)?|reserv(?:e|ation|ations)|reservar|reserva|reservación|reservaciones|table\s+request|request\s+(?:a\s+)?table|table\s+booking)\b/i.test(positive);
}

/** Route factual named-venue lookups to the existing catalog API rather than
 * asking an LLM to invent an address. No restaurant names are hardcoded.
 */
export function isRestaurantVenueFactQuery(text: string): boolean {
  if (isRestaurantBookingAction(text) || looksLikeNonRestaurantSearch(text)) return false;
  // Respect category boundaries even when the generic classifier does not
  // recognize a conversational question form such as "Where is a salsa club?".
  if (/\b(?:club|discoteca|salsa\s+bar|nightlife|cafe|café|coffee\s+shop)\b/i.test(text)) return false;
  const normalized = text.trim();
  return /^(?:where\s+(?:is|can\s+i\s+find)|what(?:'s|\s+is)\s+the\s+(?:street\s+)?address\s+(?:of|for)|d[oó]nde\s+(?:queda|est[aá])|direcci[oó]n\s+(?:de|del)|find\s+)(?:.{3,120})/i.test(normalized) ||
    /\b(?:address|direcci[oó]n)\s*[?.!]*$/i.test(normalized);
}

function looksLikeNonRestaurantSearch(text: string): boolean {
  return looksLikeNightlifeGroundingSearch(text) || looksLikeCafeSearch(text);
}

/** Show canned clarify + filter chips without calling conciergeAgent. */
export function shouldInstantRestaurantClarify(
  text: string,
  memory: ConciergeWorkingMemory,
): boolean {
  return (
    !isRestaurantBookingAction(text) &&
    !isRestaurantVenueFactQuery(text) &&
    isGenericRestaurantQuery(text) &&
    memory.lastRestaurantQuery?.genericAskPending !== true
  );
}

function attachQueryText(
  params: RestaurantSearchApiParams,
  text: string,
): RestaurantSearchApiParams {
  const trimmed = text.trim();
  if (!trimmed) return params;
  return { ...params, queryText: trimmed };
}

/** Run Supabase search via /api/restaurants/search (skip LLM). */
export function buildRestaurantSearchParams(
  text: string,
  memory?: ConciergeWorkingMemory,
  overrides?: Partial<RestaurantSearchApiParams>,
): RestaurantSearchApiParams | null {
  if (looksLikeNonRestaurantSearch(text) || isRestaurantBookingAction(text)) return null;

  // Specific address/identity questions must preserve the *user's* venue name.
  // The ordinary composed query drops that name, causing the top five generic
  // restaurants to displace the requested venue.
  if (isRestaurantVenueFactQuery(text)) {
    return { queryText: text.trim(), limit: FAST_PATH_LIMIT };
  }

  const s = scoreRestaurantQuery(text);
  const q = memory?.lastRestaurantQuery;

  if (overrides) {
    const base: RestaurantSearchApiParams = {
      neighborhood: overrides.neighborhood ?? q?.neighborhood ?? s.neighborhood,
      cuisine: overrides.cuisine ?? q?.cuisine ?? s.cuisine,
      priceTier: overrides.priceTier ?? q?.priceTier ?? s.priceTier,
      userLatitude: overrides.userLatitude,
      userLongitude: overrides.userLongitude,
      limit: FAST_PATH_LIMIT,
    };
    const prompt =
      overrides.queryText ??
      composeRestaurantQueryText(text, {
        cuisine: base.cuisine,
        vibe: q?.vibe ?? s.vibe,
        neighborhood: base.neighborhood,
        priceTier: base.priceTier,
        nearMe: Boolean(base.userLatitude),
      });
    return attachQueryText({ ...base, queryText: prompt }, prompt);
  }

  if (q?.genericAskPending === true && hasRestaurantFastPathSignals(text, s)) {
    const composed = composeRestaurantQueryText(text, {
      ...s,
      neighborhood: s.neighborhood ?? q.neighborhood,
      cuisine: s.cuisine ?? q.cuisine,
      priceTier: s.priceTier ?? q.priceTier,
      nearMe: s.nearMe,
    });
    return attachQueryText(
      {
        neighborhood: s.neighborhood ?? q.neighborhood,
        cuisine: s.cuisine ?? q.cuisine,
        priceTier: s.priceTier ?? q.priceTier,
        queryText: composed,
        limit: FAST_PATH_LIMIT,
      },
      composed,
    );
  }

  const analysis = analyzeVenueIntelligenceQuery(text);
  if (analysis.route === "restaurant_hybrid" && analysis.action === "search_now") {
    return {
      neighborhood: analysis.slots.neighborhood ?? s.neighborhood,
      cuisine: analysis.slots.cuisine ?? s.cuisine,
      priceTier: s.priceTier,
      queryText: composeRestaurantQueryText(text, {
        cuisine: analysis.slots.cuisine ?? s.cuisine,
        vibe: s.vibe,
        neighborhood: analysis.slots.neighborhood ?? s.neighborhood,
        priceTier: s.priceTier,
      }),
      limit: FAST_PATH_LIMIT,
    };
  }

  if (looksLikeRestaurantDiscovery(text) && hasRestaurantFastPathSignals(text, s)) {
    const composed = composeRestaurantQueryText(text, s);
    return attachQueryText(
      {
        neighborhood: s.neighborhood,
        cuisine: s.cuisine,
        priceTier: s.priceTier,
        queryText: composed,
        limit: FAST_PATH_LIMIT,
      },
      composed,
    );
  }

  return null;
}

export function canFastPathRestaurantSearch(
  text: string,
  memory?: ConciergeWorkingMemory,
): boolean {
  if (shouldInstantRestaurantClarify(text, memory ?? {})) return true;
  return buildRestaurantSearchParams(text, memory) != null;
}

export function composeRestaurantQueryText(
  text: string,
  signals: {
    cuisine?: string;
    vibe?: string;
    neighborhood?: string;
    priceTier?: string;
    nearMe?: boolean;
  },
): string {
  const parts: string[] = [];
  if (signals.cuisine) parts.push(signals.cuisine);
  if (signals.vibe) parts.push(signals.vibe);
  parts.push("restaurants");
  if (signals.neighborhood) parts.push(`in ${signals.neighborhood}`);
  if (signals.nearMe) parts.push("near me");
  if (signals.priceTier) parts.push(signals.priceTier);
  if (parts.length <= 1) return text.trim();
  return parts.join(" ");
}

export function restaurantsToToolEnvelope(cards: Restaurant[]) {
  return {
    results: cards.map((r) => ({
      id: r.id,
      title: r.name,
      name: r.name,
      neighborhood: r.neighborhood,
      avgPricePerPerson: r.avgPricePerPerson,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      sourceUrl: r.sourceUrl,
      imageUrl: r.imageUrl,
      placeId: r.placeId ?? null,
      mapsUrl: r.mapsUrl ?? null,
      aiSummary: r.aiSummary ?? null,
    })),
    total: cards.length,
    source: "supabase" as const,
  };
}

export function fastPathRestaurantSummary(
  count: number,
  pinCount: number,
  neighborhood?: string,
): string {
  if (count === 0) {
    return "No restaurants matched — try another neighborhood or cuisine.";
  }
  const area = neighborhood ? ` in ${neighborhood}` : " across Medellín";
  return withMapCoverage(`Found ${count} restaurant${count === 1 ? "" : "s"}${area}`, count, pinCount);
}
