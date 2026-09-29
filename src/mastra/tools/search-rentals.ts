import { createTool } from '@mastra/core/tools';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerAnonEnv } from '@/lib/supabase/server-env';
import { z } from 'zod';
import { runAuditedSearch } from '../lib/run-audited-search';
import { searchRentalsIntelligent } from '../lib/intelligence-rental-search';
import { writeSearchLog, type EmbedStatus } from '../lib/search-logs';
import type { EmbedFailureReason } from '../lib/query-embedding';

export const rentalSchema = z.object({
  id: z.string(),
  title: z.string(),
  neighborhood: z.string(),
  nightly_price: z.number(),
  /**
   * The listing's own currency (`apartments.currency`). Previously a `z.literal('USD')`,
   * which silently relabelled every COP listing — the currency owner onboarding writes — as
   * USD, making a 2,400,000 COP monthly rent read as a USD figure.
   */
  currency: z.string(),
  bedrooms: z.number(),
  wifi: z.boolean(),
  amenities: z.array(z.string()),
  image: z.string(),
  source_url: z.string(),
  /**
   * SAN-1349 — whether this listing may be requested for a viewing right now.
   *
   * `false` is the safe default: the listing has no canonical owner, or is not
   * active + approved + published, or is outside its current availability window.
   * The database re-validates the concrete requested time, so this flag is only
   * ever allowed to under-claim requestability, never to over-claim it.
   */
  can_schedule_viewing: z.boolean(),
  /**
   * `null` — never `undefined` — when `can_schedule_viewing` is false, so tool and
   * API serialization stays deterministic for consumers and LLM narration.
   */
  schedule_viewing_url: z.string().nullable(),
  host_name: z.string(),
  availability: z.string(),
  tags: z.array(z.string()),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  /** Monthly price when available (authoritative for monthly display). */
  price_monthly: z.number().optional(),
});

export type Rental = z.infer<typeof rentalSchema>;

export type RentalQuery = {
  neighborhood?: string;
  minBedrooms?: number;
  maxPricePerNight?: number;
  limit?: number;
  queryText?: string;
  checkIn?: string;
  checkOut?: string;
  stayType?: "nightly" | "monthly" | "total_trip";
};

export type RentalSearchResult = {
  results: Rental[];
  total: number;
  source: 'supabase' | 'mock';
  hybridUsed?: boolean;
  embedStatus?: EmbedStatus;
  embedFailureReason?: EmbedFailureReason;
  embedHttpStatus?: number;
  rankExplanation?: import('../lib/search-logs').RankExplanationEntry[];
};

let _client: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (_client) return _client;
  const env = getSupabaseServerAnonEnv();
  if (!env) return null;
  _client = createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

export interface ApartmentRow {
  id: string;
  title: string;
  neighborhood: string;
  bedrooms: number | null;
  /**
   * Genuinely nullable in the database. It was declared non-null here, which is what let
   * `Number(null) === 0` pass unnoticed and turn a monthly-only listing into "$0/night".
   * `price_monthly` is the column the owner onboarding flow actually writes.
   */
  price_daily: number | null;
  price_monthly: number | null;
  /**
   * The apartment's own currency. `NOT NULL DEFAULT 'USD'` in the database, but selected
   * defensively so a projection that forgets the column cannot silently claim USD.
   */
  currency: string | null;
  wifi_speed: number | null;
  amenities: string[] | null;
  images: string[] | null;
  host_name: string | null;
  source_url: string | null;
  available_from: string | null;
  available_to: string | null;
  pet_friendly: boolean;
  parking_included: boolean;
  minimum_stay_days: number;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * SAN-1349 ownership + workflow proof.
   *
   * These are REQUIRED — not optional — so a partial row cannot silently skip the
   * requestability check. `landlord_id` is genuinely nullable in the database; the other
   * three are `NOT NULL` there, and every select list feeding this type names them.
   */
  landlord_id: string | null;
  moderation_status: string;
  listing_workflow_status: string;
  status: string;
}

/** The columns that decide whether a listing may be requested for a viewing. */
export type RentalRequestabilityInput = {
  landlord_id?: string | null;
  status?: string | null;
  moderation_status?: string | null;
  listing_workflow_status?: string | null;
  available_from?: string | null;
  available_to?: string | null;
};

/**
 * The timezone the database uses for its availability calendar. `p1_schedule_tour_atomic`
 * compares `(p_scheduled_at AT TIME ZONE 'America/Bogota')::date` against `available_from` /
 * `available_to`, so the application must read "today" in the same zone or it will disagree
 * with the database for five hours out of every day.
 */
export const RENTAL_AVAILABILITY_TIME_ZONE = 'America/Bogota';

const availabilityDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RENTAL_AVAILABILITY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The calendar date in `America/Bogota` as `YYYY-MM-DD`, matching how Postgres DATE columns are
 * serialized, for comparison against `available_from` / `available_to`.
 *
 * Built from `formatToParts` rather than `toISOString().slice(0, 10)`: the latter is the UTC
 * date, which in Medellín (UTC−5) runs a day ahead of the local date from 19:00 local onward.
 * A listing with `available_to = "2026-09-27"` would then be wrongly treated as expired at
 * 2026-09-27 20:00 local. The database would have accepted it, so the mismatch only ever hid
 * requestable listings from users.
 */
export function rentalAvailabilityDate(at: Date = new Date()): string {
  const parts = availabilityDateFormatter.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * SAN-1349 — the application-side mirror of the database's new-request eligibility rule.
 *
 * The database is the authority: `public.p1_schedule_tour_atomic` re-checks ownership,
 * moderation, workflow state and the *selected* viewing time inside the transaction, and a
 * bypassed UI still fails there. This helper exists only so search results and the browse card
 * never advertise an action the database will reject.
 *
 * It fails CLOSED on missing proof. Every predicate is an allow-list, so an absent, null or
 * unexpected value is rejected rather than skipped — the helper can only ever under-claim
 * requestability, never over-claim it. It proves what the UI can actually know: canonical
 * owner, active, approved, published, and the listing's current-date availability window. It
 * cannot know the eventual viewing timestamp, so it must not claim more than that.
 */
export function isRentalRequestable(
  row: RentalRequestabilityInput,
  today: Date = new Date(),
): boolean {
  if (!row.landlord_id) return false;
  // Strict equality on purpose: `undefined` and `null` must reject, not fall through.
  if (row.status !== 'active') return false;
  if (row.moderation_status !== 'approved') return false;
  if (row.listing_workflow_status !== 'published') return false;
  const isoToday = rentalAvailabilityDate(today);
  if (row.available_from && row.available_from > isoToday) return false;
  if (row.available_to && row.available_to < isoToday) return false;
  return true;
}

/**
 * The nightly price used for display, sorting and budget comparison.
 *
 * Listings created through the product's own owner onboarding carry **only**
 * `price_monthly` (`src/lib/rentals/submit-broker-onboarding.ts`). Requiring `price_daily`
 * therefore excluded every listing the product could actually create.
 *
 * This derives the same indicative nightly the intelligent search path already uses
 * (`intelligence-rental-search.ts`), so both paths agree on what a monthly listing costs
 * per night. It never invents a price: it is fully determined by the owner's own monthly
 * figure, and a row with neither price yields `0`.
 */
export function nightlyPriceFrom(row: {
  price_daily?: number | string | null;
  price_monthly?: number | string | null;
}): number {
  const daily = row.price_daily == null ? null : Number(row.price_daily);
  if (daily != null && Number.isFinite(daily)) return daily;
  const monthly = row.price_monthly == null ? null : Number(row.price_monthly);
  if (monthly != null && Number.isFinite(monthly)) return Math.round(monthly / 30);
  return 0;
}

/**
 * The currency `maxPricePerNight` is expressed in.
 *
 * The tool schema documents it as "USD per night" and the short-stay catalogue is priced in
 * USD. There is no exchange-rate source anywhere in this repository, so a budget can only be
 * applied to a listing priced in the same currency.
 */
export const NIGHTLY_BUDGET_CURRENCY = 'USD';

/**
 * The monthly ceiling equivalent to `Math.round(monthly / 30) <= nightlyCap`.
 *
 * Display derives the nightly price by **rounding**, so a raw `monthly <= cap * 30` filter
 * disagrees with the label at the boundary: 2414 / 30 rounds to 80, inside an $80 cap, but
 * `2414 <= 2400` is false — the listing would be filtered out while its label said it
 * qualified. `round(x) <= cap` is `x < cap + 0.5`, so for whole units the largest qualifying
 * monthly price is `cap * 30 + 14`.
 */
export function monthlyCeilingForNightlyCap(nightlyCap: number): number {
  return nightlyCap * 30 + 14;
}

/**
 * The `or=(...)` predicate deciding which apartments a search may return.
 *
 * Always requires a price. When a nightly budget is supplied it is applied **only to listings
 * in the budget's own currency**. A listing priced in another currency — the COP monthly
 * inventory that owner onboarding creates — is kept rather than compared, because
 * `2,400,000 COP <= 2400` is not a budget check, it is a unit error that silently deletes real
 * supply. The card shows that listing's own currency, so the renter can judge it themselves.
 */
export function rentalPricePredicate(maxNightly: number | null): string {
  if (maxNightly == null) {
    return 'price_daily.not.is.null,price_monthly.not.is.null';
  }
  const ceiling = monthlyCeilingForNightlyCap(maxNightly);
  const sameCurrency = `currency.eq.${NIGHTLY_BUDGET_CURRENCY}`;
  const otherCurrency = `currency.neq.${NIGHTLY_BUDGET_CURRENCY}`;
  return [
    // Comparable currency? No — keep it, and never compare it to the budget.
    `and(${otherCurrency},price_daily.not.is.null)`,
    `and(${otherCurrency},price_monthly.not.is.null)`,
    // Same currency: the budget applies to the stored nightly price, or to a monthly-only row.
    `and(${sameCurrency},price_daily.not.is.null,price_daily.lte.${maxNightly})`,
    `and(${sameCurrency},price_daily.is.null,price_monthly.not.is.null,price_monthly.lte.${ceiling})`,
  ].join(',');
}

export function rowToRental(r: ApartmentRow): Rental {
  const canScheduleViewing = isRentalRequestable(r);
  const nightlyPrice = nightlyPriceFrom(r);
  return rentalSchema.parse({
    id: r.id,
    title: r.title,
    neighborhood: r.neighborhood,
    nightly_price: nightlyPrice,
    currency: (r.currency ?? 'USD').toUpperCase(),
    bedrooms: r.bedrooms ?? 0,
    wifi: (r.wifi_speed ?? 0) > 0,
    amenities: r.amenities ?? [],
    image: (r.images ?? [])[0] ?? '',
    source_url: r.source_url ?? `https://mdeai.co/rentals/${r.slug ?? r.id}`,
    can_schedule_viewing: canScheduleViewing,
    schedule_viewing_url: canScheduleViewing
      ? `https://mdeai.co/rentals/${r.slug ?? r.id}/schedule-viewing`
      : null,
    host_name: r.host_name ?? 'Host',
    availability: formatAvailability(r.available_from, r.available_to),
    tags: deriveTags({
      amenities: r.amenities ?? [],
      pet_friendly: r.pet_friendly,
      parking_included: r.parking_included,
      minimum_stay_days: r.minimum_stay_days,
      wifi_speed: r.wifi_speed,
      price_daily: nightlyPrice,
    }),
    latitude: r.latitude != null ? Number(r.latitude) : undefined,
    longitude: r.longitude != null ? Number(r.longitude) : undefined,
    price_monthly: r.price_monthly != null ? Number(r.price_monthly) : undefined,
  });
}

function formatAvailability(from: string | null, to: string | null): string {
  if (!from && !to) return 'Available now';
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (from && to) return `Available ${fmt(from)} – ${fmt(to)}`;
  if (from) return `Available from ${fmt(from)}`;
  return 'Available now';
}

function deriveTags(row: {
  amenities: string[];
  pet_friendly: boolean;
  parking_included: boolean;
  minimum_stay_days: number;
  wifi_speed: number | null;
  price_daily: number;
}): string[] {
  const tags: string[] = [];
  const am = (row.amenities ?? []).map((a) => a.toLowerCase());
  if (am.some((a) => a.includes('workspace') || a.includes('desk') || a.includes('cowork')))
    tags.push('remote-work');
  if (row.pet_friendly) tags.push('pet-friendly');
  if (row.parking_included) tags.push('parking');
  if (row.minimum_stay_days >= 28) tags.push('long-stay');
  if (row.price_daily && row.price_daily <= 50) tags.push('budget');
  if (am.some((a) => a.includes('pool') || a.includes('gym'))) tags.push('gym');
  if (am.some((a) => a.includes('nightlife') || a.includes('bar'))) tags.push('nightlife');
  if (am.some((a) => a.includes('family') || a.includes('kid'))) tags.push('family');
  return tags.length ? tags : ['walkable'];
}

export function isAvailableForStay(
  row: { available_from: string | null; available_to: string | null },
  checkIn?: string,
  checkOut?: string,
): boolean {
  if (!checkIn && !checkOut) return true;
  if (checkOut && row.available_from && row.available_from > checkOut) return false;
  if (checkIn && row.available_to && row.available_to < checkIn) return false;
  return true;
}

export function sortForMonthlyStay<T extends Rental>(results: T[]): T[] {
  return [...results].sort((a, b) => {
    const aLong = a.tags.includes('long-stay') ? 0 : 1;
    const bLong = b.tags.includes('long-stay') ? 0 : 1;
    if (aLong !== bLong) return aLong - bLong;
    return a.nightly_price - b.nightly_price;
  });
}

async function searchRentalsFromSupabase(
  query: RentalQuery,
): Promise<{ results: Rental[]; total: number; source: 'supabase' }> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client unavailable');
  }

  const limit = query.limit ?? 8;
  // A nightly budget is only comparable within its own currency; see rentalPricePredicate().
  const maxNightly =
    typeof query.maxPricePerNight === 'number' ? query.maxPricePerNight : null;
  // MVP: count:'exact' for accurate browse subtitle (~180 active listings). Revisit
  // estimated/cached counts post-MVP if apartments table grows materially.
  let q = client
    .from('apartments')
    .select(
      'id, title, neighborhood, bedrooms, price_daily, price_monthly, currency, wifi_speed, amenities, images, host_name, source_url, available_from, available_to, pet_friendly, parking_included, minimum_stay_days, slug, latitude, longitude, status, landlord_id, moderation_status, listing_workflow_status',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .or(rentalPricePredicate(maxNightly))
    .order('price_daily', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (query.neighborhood) {
    q = q.ilike('neighborhood', `%${query.neighborhood}%`);
  }
  if (typeof query.minBedrooms === 'number') {
    q = q.gte('bedrooms', query.minBedrooms);
  }

  // Always exclude expired rentals: available_to IS NULL (open-ended) OR available_to >= checkIn || today.
  // SAN-1349: "today" is the America/Bogota date, matching the timezone the viewing RPC uses,
  // so the query window and isRentalRequestable() cannot disagree near local midnight.
  const today = rentalAvailabilityDate();
  const checkInDate = query.checkIn ?? today;
  q = q.or(`available_to.is.null,available_to.gte.${checkInDate}`);
  if (query.checkOut) {
    // available_from IS NULL (available now) OR available_from <= checkOut
    q = q.or(`available_from.is.null,available_from.lte.${query.checkOut}`);
  }

  const { data, error, count } = await q;
  if (error) {
    throw new Error(error.message);
  }

  let results = ((data ?? []) as ApartmentRow[]).map(rowToRental);
  if (query.stayType === 'monthly') {
    results = sortForMonthlyStay(results);
  }
  return { results, total: count ?? results.length, source: 'supabase' };
}

// Fallback mock kept for offline/test environments.
// SAN-1349: these fixtures carry no ownership proof, so every mock is deliberately NOT
// requestable (`can_schedule_viewing: false`, `schedule_viewing_url: null`). A mock must never
// advertise a viewing action that the database would reject.
const MOCK_RENTALS: Rental[] = [
  {
    id: 'rnt_lau_001',
    title: 'Bright 2BR with Balcony in Laureles',
    neighborhood: 'Laureles',
    nightly_price: 78,
    currency: 'USD',
    bedrooms: 2,
    wifi: true,
    amenities: ['wifi', 'workspace', 'kitchen', 'balcony', 'washer'],
    image: 'https://images.unsplash.com/photo-rental-lau-001',
    source_url: 'https://mdeai.co/rentals/rnt_lau_001',
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: 'Andrés Restrepo',
    availability: 'Available May 15 – Aug 30, 2026',
    tags: ['long-stay', 'remote-work', 'walkable'],
    latitude: 6.2530,
    longitude: -75.5910,
  },
  {
    id: 'rnt_lau_002',
    title: 'Modern 1BR Loft near Primer Parque',
    neighborhood: 'Laureles',
    nightly_price: 64,
    currency: 'USD',
    bedrooms: 1,
    wifi: true,
    amenities: ['wifi', 'workspace', 'kitchen', 'gym', 'rooftop'],
    image: 'https://images.unsplash.com/photo-rental-lau-002',
    source_url: 'https://mdeai.co/rentals/rnt_lau_002',
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: 'Sofía Vélez',
    availability: 'Available now – Jul 10, 2026',
    tags: ['solo-traveler', 'remote-work', 'pet-friendly'],
    latitude: 6.2515,
    longitude: -75.5922,
  },
  {
    id: 'rnt_lau_003',
    title: 'Quiet Studio off Avenida Nutibara',
    neighborhood: 'Laureles',
    nightly_price: 42,
    currency: 'USD',
    bedrooms: 0,
    wifi: true,
    amenities: ['wifi', 'kitchen', 'workspace'],
    image: 'https://images.unsplash.com/photo-rental-lau-003',
    source_url: 'https://mdeai.co/rentals/rnt_lau_003',
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: 'Camila Ortiz',
    availability: 'Available Jun 1 – Dec 31, 2026',
    tags: ['budget', 'long-stay', 'quiet'],
    latitude: 6.2525,
    longitude: -75.5932,
  },
  {
    id: 'rnt_lau_004',
    title: 'Spacious 3BR Penthouse · Segundo Parque',
    neighborhood: 'Laureles',
    nightly_price: 110,
    currency: 'USD',
    bedrooms: 3,
    wifi: true,
    amenities: ['wifi', 'pool', 'workspace', 'kitchen', 'washer', 'balcony'],
    image: 'https://images.unsplash.com/photo-rental-lau-004',
    source_url: 'https://mdeai.co/rentals/rnt_lau_004',
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: 'Miguel Arango',
    availability: 'Available Jul 1 – Oct 31, 2026',
    tags: ['family', 'premium', 'long-stay'],
    latitude: 6.2510,
    longitude: -75.5905,
  },
  {
    id: 'rnt_lau_005',
    title: 'Cozy 1BR near La Setenta',
    neighborhood: 'Laureles',
    nightly_price: 55,
    currency: 'USD',
    bedrooms: 1,
    wifi: true,
    amenities: ['wifi', 'kitchen', 'workspace', 'smart-tv'],
    image: 'https://images.unsplash.com/photo-rental-lau-005',
    source_url: 'https://mdeai.co/rentals/rnt_lau_005',
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: 'Laura Gómez',
    availability: 'Available now – Sep 30, 2026',
    tags: ['nightlife', 'walkable', 'solo-traveler'],
    latitude: 6.2535,
    longitude: -75.5917,
  },
  {
    id: 'rnt_pob_001',
    title: 'Sunny 2BR in El Poblado',
    neighborhood: 'El Poblado',
    nightly_price: 95,
    currency: 'USD',
    bedrooms: 2,
    wifi: true,
    amenities: ['wifi', 'pool', 'gym', 'kitchen', 'concierge'],
    image: 'https://images.unsplash.com/photo-rental-pob-001',
    source_url: 'https://mdeai.co/rentals/rnt_pob_001',
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: 'Patricia Lopera',
    availability: 'Available Jun 1 – Aug 31, 2026',
    tags: ['nightlife', 'walkable', 'gym'],
    latitude: 6.2090,
    longitude: -75.5655,
  },
  {
    id: 'rnt_env_001',
    title: 'Cozy Studio in Envigado',
    neighborhood: 'Envigado',
    nightly_price: 38,
    currency: 'USD',
    bedrooms: 0,
    wifi: true,
    amenities: ['wifi', 'kitchen'],
    image: 'https://images.unsplash.com/photo-rental-env-001',
    source_url: 'https://mdeai.co/rentals/rnt_env_001',
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: 'Juliana Mejía',
    availability: 'Available now – Aug 15, 2026',
    tags: ['budget', 'quiet', 'long-stay'],
    latitude: 6.1750,
    longitude: -75.5908,
  },
];

// skipcq: JS-0067 - module-local helper; not browser global scope
function searchRentalsFromMock(query: RentalQuery): { results: Rental[]; total: number; source: 'mock' } {
  let results = MOCK_RENTALS.slice();
  if (query.neighborhood) {
    const q = query.neighborhood.toLowerCase();
    results = results.filter((r) => r.neighborhood.toLowerCase().includes(q));
  }
  if (typeof query.minBedrooms === 'number') {
    const minBedrooms = query.minBedrooms;
    results = results.filter((r) => r.bedrooms >= minBedrooms);
  }
  if (typeof query.maxPricePerNight === 'number') {
    const maxPricePerNight = query.maxPricePerNight;
    results = results.filter((r) => r.nightly_price <= maxPricePerNight);
  }
  const total = results.length;
  return { results: results.slice(0, query.limit ?? 8), total, source: 'mock' };
}

// Named export for direct workflow calls (sync signature kept for compatibility;
// internally async — callers that need real DB data should await searchRentals())
export async function searchRentals(
  query: RentalQuery,
): Promise<RentalSearchResult> {
  const limit = query.limit ?? 8;

  if (query.queryText?.trim()) {
    try {
      const started = Date.now();
      const intel = await searchRentalsIntelligent(query);
      const latencyMs = Date.now() - started;
      await writeSearchLog({
        queryText: query.queryText,
        slots: intel.slots,
        toolName: 'search-rentals',
        resultsCount: intel.results.length,
        latencyMs,
        hybridUsed: intel.hybridUsed,
        embedStatus: intel.embedStatus,
        embedFailureReason: intel.embedFailureReason,
        embedHttpStatus: intel.embedHttpStatus,
        groundingUsed: false,
        rankExplanation: intel.rankExplanation,
      });
      return {
        results: intel.results.slice(0, limit),
        total: intel.total,
        source: intel.source,
        hybridUsed: intel.hybridUsed,
        embedStatus: intel.embedStatus,
        embedFailureReason: intel.embedFailureReason,
        embedHttpStatus: intel.embedHttpStatus,
        rankExplanation: intel.rankExplanation,
      };
    } catch (err) {
      console.warn(
        '[search-rentals] intelligent search failed, falling back to structured search:',
        (err as Error).message,
      );
    }
  }

  try {
    const { results, total, source } = await searchRentalsFromSupabase(query);
    return { results, total, source };
  } catch (err) {
    console.warn(
      '[search-rentals] Supabase query failed, falling back to mock:',
      (err as Error).message,
    );
  }
  return searchRentalsFromMock(query);
}

export const searchRentalsTool = createTool({
  id: 'search-rentals',
  description:
    'Search Medellín rentals by neighborhood, bedrooms, and price. Returns rental cards with source_url and a truthful viewing contract: can_schedule_viewing plus schedule_viewing_url (null when the listing is not requestable). Queries live Supabase apartments table; falls back to demo data if DB is unavailable. Never tell the user a rental can be scheduled when can_schedule_viewing is false.',
  inputSchema: z.object({
    neighborhood: z.string().optional().describe('e.g. Laureles, El Poblado, Envigado'),
    minBedrooms: z.number().int().min(0).optional(),
    maxPricePerNight: z.number().positive().optional().describe('USD per night'),
    limit: z.number().int().min(1).max(20).default(8),
    queryText: z
      .string()
      .optional()
      .describe('Natural-language rental search e.g. digital nomad rental in Laureles near cafes'),
  }),
  outputSchema: z.object({
    results: z.array(
      rentalSchema.extend({
        rankScore: z.number().optional(),
        evidenceText: z.string().nullable().optional(),
      }),
    ),
    source: z.enum(['supabase', 'mock']),
    hybridUsed: z.boolean().optional(),
    rankExplanation: z
      .array(
        z.object({
          factor: z.string(),
          score: z.number(),
          note: z.string(),
        }),
      )
      .optional(),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (inputData: RentalQuery, context?: any) => {
    const { neighborhood, minBedrooms, maxPricePerNight, limit = 8, queryText } = inputData;
    const { results, source, hybridUsed, rankExplanation } = await runAuditedSearch(
      'search-rentals',
      searchRentals,
      { neighborhood, minBedrooms, maxPricePerNight, limit, queryText },
      context,
    );

    return {
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        neighborhood: r.neighborhood,
        bedrooms: r.bedrooms,
        nightly_price: r.nightly_price,
        price_monthly: r.price_monthly,
        currency: r.currency,
        host_name: r.host_name,
        wifi: r.wifi,
        amenities: r.amenities,
        tags: r.tags,
        availability: r.availability,
        image: r.image,
        source_url: r.source_url,
        can_schedule_viewing: r.can_schedule_viewing,
        schedule_viewing_url: r.schedule_viewing_url,
        latitude: r.latitude,
        longitude: r.longitude,
        rankScore: "rankScore" in r ? (r as { rankScore?: number }).rankScore : undefined,
        evidenceText: "evidenceText" in r ? (r as { evidenceText?: string | null }).evidenceText : undefined,
      })),
      source,
      hybridUsed,
      rankExplanation,
    };
  },
});
