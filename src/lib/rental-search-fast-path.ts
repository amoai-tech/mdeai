import type { ConciergeWorkingMemory } from "@/lib/types";
import type { Rental } from "@/mastra/tools/search-rentals";
import {
  buildRentalSearchParams,
  canFastPathRentalSearch,
  clearsFurnishingPreference,
  type RentalSearchApiParams,
} from "@/lib/rental-query-parser";

export {
  buildRentalSearchParams,
  canFastPathRentalSearch,
};

export function rentalsToToolEnvelope(
  cards: Rental[],
  meta?: {
    total?: number;
    hybridUsed?: boolean;
    rankExplanation?: Array<{ factor: string; score: number; note: string }>;
    budgetNote?: string;
  },
) {
  return {
    results: cards.map((r) => ({
      id: r.id,
      title: r.title,
      neighborhood: r.neighborhood,
      bedrooms: r.bedrooms,
      bedrooms_unknown: r.bedrooms_unknown,
      nightly_price: r.nightly_price,
      price_monthly: r.price_monthly,
      currency: r.currency,
      host_name: r.host_name,
      wifi: r.wifi,
      amenities: r.amenities,
      availability: r.availability,
      photo_url: r.image,
      image_url: r.image,
      // SAN-1504: the chat Details panel renders the complete result. These were dropped here, so a
      // fast-path card could not show its photo list, photo count or source provider.
      image: r.image,
      images: r.images,
      photo_count: r.photo_count,
      source_provider: r.source_provider,
      source_url: r.source_url,
      // SAN-1349: the envelope forwards the requestability contract verbatim. It never
      // recreates the viewing URL — a URL exists only when the tool proved the listing is
      // requestable, and it is null otherwise.
      can_schedule_viewing: r.can_schedule_viewing,
      schedule_viewing_url: r.schedule_viewing_url,
      tags: r.tags,
      latitude: r.latitude,
      longitude: r.longitude,
    })),
    // Preserve the backend match count. A short chat result is not the entire
    // catalog, and explicit "show 3" requests must not turn 42 into "3 total".
    total: typeof meta?.total === "number" && Number.isSafeInteger(meta.total) && meta.total >= cards.length
      ? meta.total
      : cards.length,
    source: "supabase" as const,
    hybridUsed: meta?.hybridUsed,
    rankExplanation: meta?.rankExplanation,
    budgetNote: meta?.budgetNote,
  };
}

export function rentalsToPanelRows(
  cards: Rental[],
): ConciergeWorkingMemory["lastRentalResults"] {
  return cards.map((r) => ({
    id: r.id,
    title: r.title,
    neighborhood: r.neighborhood,
    // Omit placeholders: 0 means "no nightly price", and bedrooms_unknown
    // means the feed did not record a bedroom count.
    ...(r.nightly_price > 0 ? { nightly_price: r.nightly_price } : {}),
    price_monthly: r.price_monthly,
    currency: r.currency,
    ...(r.bedrooms_unknown ? {} : { bedrooms: r.bedrooms }),
    amenities: r.amenities,
  }));
}

export {
  fastPathRentalNarrative,
  fastPathRentalSummary,
} from "@/lib/rental-display";


/**
 * A follow-up that only tightens one constraint must not silently drop the
 * others. Filters are re-derived from the latest words, so a requirement the
 * renter does not repeat comes back `undefined` — and an undefined filter
 * *widens* the result set. Carry the still-visible constraints forward from the
 * params that produced the cards the renter is actually looking at.
 *
 * An explicit clear still wins: "either furnished or unfurnished" must not have
 * the previous requirement copied back in.
 */
export function carryForwardVisibleFilters(
  params: RentalSearchApiParams,
  shown: RentalSearchApiParams | undefined,
  text: string,
): RentalSearchApiParams {
  if (!shown) return params;
  const next: RentalSearchApiParams = { ...params };
  if (next.neighborhood == null && shown.neighborhood) next.neighborhood = shown.neighborhood;
  if (next.minBedrooms == null && shown.minBedrooms != null) next.minBedrooms = shown.minBedrooms;
  if (next.maxBedrooms == null && shown.maxBedrooms != null) next.maxBedrooms = shown.maxBedrooms;
  // `undefined` means "not restated here"; an explicit clear is handled by the guard below.
  if (next.furnished === undefined && shown.furnished != null && !clearsFurnishingPreference(text)) {
    next.furnished = shown.furnished;
  }
  return next;
}

export type { RentalSearchApiParams };
