import { createTool } from '@mastra/core/tools';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerAnonEnv } from '@/lib/supabase/server-env';
import { formatDateOnly } from '@/lib/rentals/date-only';
import {
  isAvailabilityUnconfirmed,
  isSelfAttested,
  isExternalSourceListing,
  externalSourceProvider,
} from '@/lib/rentals/provenance';
import { applyAvailabilityFilters } from '@/lib/rentals/availability-filter';
import { z } from 'zod';
import { runAuditedSearch } from '../lib/run-audited-search';
import { searchRentalsIntelligent } from '../lib/intelligence-rental-search';
import { EXTERNAL_RENTAL_BUDGET_NOTE, getOptionalExternalRentals, mixRentalResults } from '@/lib/rentals/mixed-rental-results';
import {
  RentalSearchUnavailableError,
  describeRentalSearchError,
  isRentalSearchUnavailable,
} from '../lib/rental-search-unavailable';
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
  /** Dev-preview only: the source advert had no bedroom count, so `bedrooms` stays 0. */
  bedrooms_unknown: z.boolean().optional(),
  wifi: z.boolean(),
  amenities: z.array(z.string()),
  image: z.string(),
  /**
   * Public photos for the Details panel (at most `RENTAL_PANEL_PHOTO_LIMIT`); `image` is always the
   * first. Absent = just `image`.
   */
  images: z.array(z.string()).optional(),
  /** Total photos the listing has, when more than `images` carries (the panel links to the rest). */
  photo_count: z.number().int().optional(),
  source_url: z.string(),
  /** Preserved advertiser name for a third-party-source listing (e.g. "Fincaraíz"). */
  source_provider: z.string().optional(),
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
   *
   * SAN-478 — this points at the MDE listing detail page, which is where the viewing
   * modal actually lives. It deliberately does NOT point at a `/schedule-viewing`
   * route: no such route has ever existed, so the previous value handed every consumer
   * of this field — including the rental and concierge agents, which are instructed to
   * print it to the user — a dead 404 link. The detail page is the real, requestable
   * destination, and it resolves by id or slug.
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

/**
 * How many of an apartment's stored photos travel with each search result for the Details panel.
 * A managed listing can hold dozens (one has 76); the panel needs a gallery, not the whole set, and
 * every result is serialized into the page, so the list stays bounded. The panel links to the
 * listing's own page (`photo_count` says how many there are), which shows every photo.
 */
export const RENTAL_PANEL_PHOTO_LIMIT = 12;

export type RentalQuery = {
  neighborhood?: string;
  minBedrooms?: number;
  maxPricePerNight?: number;
  /**
   * A monthly budget in the LISTING's own currency (e.g. COP 3,500,000 per month). Applied only
   * to listings priced in `budgetCurrency`; there is no exchange-rate source in this repository,
   * so it is never converted or compared across currencies.
   */
  maxPriceMonthly?: number;
  /** Currency `maxPriceMonthly` is expressed in. @default "COP" */
  budgetCurrency?: string;
  limit?: number;
  queryText?: string;
  checkIn?: string;
  checkOut?: string;
  stayType?: "nightly" | "monthly" | "total_trip";
};

export type RentalSearchResult = {
  results: Rental[];
  total: number;
  /** SAN-1089: only the real database. A search that cannot read it throws instead. */
  source: 'supabase';
  budgetNote?: string;
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

/**
 * SAN-1502 PR2 — RequestContext key the /api/copilotkit route uses to hand rental
 * tools the caller's OWN user-scoped, RLS-governed client. Read back by
 * searchRentalsTool so an authorized test actor's search sees development
 * fixtures while an anonymous or ordinary caller never does.
 */
export const RENTAL_SUPABASE_KEY = 'rentalSupabase';

/** The DB phase is authoritative, never NODE_ENV or a browser-editable flag. */
export async function readRentalDevelopmentPhase(client: SupabaseClient): Promise<boolean> {
  // A light test stub may omit RPC; actual Supabase clients always expose it.
  if (typeof client.rpc !== 'function') return false;
  const { data, error } = await client.rpc('rental_development_active');
  if (error) {
    throw new RentalSearchUnavailableError(`phase_query_failed${error.code ? `:${error.code}` : ''}`);
  }
  return data === true;
}

/**
 * Optional per-request client. Omit it for the shared anonymous client; pass the
 * caller's user-scoped client to let RLS decide what they may read.
 */
export type RentalSearchOptions = {
  client?: SupabaseClient | null;
  /** SAN-1502 — pre-computed phase so one search performs a single phase lookup. */
  developmentPhase?: boolean;
};

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
  /** SAN-1449: provenance metadata decides the "not independently verified" label. */
  metadata?: unknown;
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
  /** PostgreSQL computed column; canonical phase-aware requestability. */
  rental_can_request_viewing?: boolean | null;
}

/** The columns that decide whether a listing may be requested for a viewing. */
export type RentalRequestabilityInput = {
  landlord_id?: string | null;
  status?: string | null;
  moderation_status?: string | null;
  listing_workflow_status?: string | null;
  available_from?: string | null;
  available_to?: string | null;
  metadata?: unknown;
  rental_can_request_viewing?: boolean | null;
};

/**
 * The timezone the database uses for its availability calendar. `p1_schedule_tour_atomic`
 * compares `(p_scheduled_at AT TIME ZONE 'America/Bogota')::date` against `available_to`
 * only — SAN-486 made viewing eligibility independent of the move-in date — so the
 * application must read "today" in the same zone or it will disagree with the database
 * for five hours out of every day.
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

/** Only the database's computed row-level requestability is authoritative. */
export function isRentalRequestable(row: RentalRequestabilityInput): boolean {
  return row.rental_can_request_viewing === true;
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

// A PostgREST .or() expression uses raw filter grammar. Reject all reserved
// characters before inserting the currency into currency.eq/currency.neq.
const monthlyBudgetCurrencySchema = z.string()
  .regex(/^[A-Za-z]{3}$/, 'Budget currency must be a three-letter code')
  .transform((currency) => currency.toUpperCase());

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

/**
 * The `or=(...)` predicate for a MONTHLY budget in a specific currency.
 *
 * `2,900,000 COP <= 3,500,000` is a real comparison; `2,900,000 <= 3500` is a unit error that
 * silently deletes real supply, so the budget applies **only** to listings in its own currency.
 * A same-currency listing must carry a stored monthly price to be a confirmed match — a
 * nightly-only row is never presented as within a monthly budget. Listings in other currencies
 * are retained (their card shows their own currency) and never compared to this budget.
 */
export function rentalMonthlyBudgetPredicate(maxMonthly: number, currency: string): string {
  if (!Number.isFinite(maxMonthly) || maxMonthly <= 0) {
    throw new RangeError('Monthly budget must be a finite positive number');
  }
  const budgetCurrency = monthlyBudgetCurrencySchema.parse(currency);
  const sameCurrency = `currency.eq.${budgetCurrency}`;
  const otherCurrency = `currency.neq.${budgetCurrency}`;
  return [
    `and(${otherCurrency},price_daily.not.is.null)`,
    `and(${otherCurrency},price_monthly.not.is.null)`,
    `and(${sameCurrency},price_monthly.not.is.null,price_monthly.lte.${maxMonthly})`,
  ].join(',');
}

/** The price predicate for whichever budget the caller supplied. Monthly wins when both are set. */
export function rentalBudgetPredicate(
  maxNightly: number | null,
  monthlyBudget: { amount: number; currency: string } | null,
): string {
  if (monthlyBudget) {
    return rentalMonthlyBudgetPredicate(monthlyBudget.amount, monthlyBudget.currency);
  }
  return rentalPricePredicate(maxNightly);
}

/**
 * The note shown with results when a monthly budget applied. Monthly budgets never compare across
 * currencies, so say so rather than implying a converted or global match.
 */
export const MONTHLY_BUDGET_NOTE =
  'Only listings priced in the requested currency at or below the monthly budget are confirmed matches. Listings in other currencies are shown without a budget comparison.';

/** The note that matches whichever budget the query applied. */
export function budgetNoteFor(query: RentalQuery): string | undefined {
  if (typeof query.maxPriceMonthly === 'number') return MONTHLY_BUDGET_NOTE;
  return query.maxPricePerNight != null ? EXTERNAL_RENTAL_BUDGET_NOTE : undefined;
}

/** The monthly budget implied by a query, or null. */
export function monthlyBudgetFromQuery(
  query: RentalQuery,
): { amount: number; currency: string } | null {
  if (typeof query.maxPriceMonthly !== 'number') return null;
  return {
    amount: query.maxPriceMonthly,
    currency: monthlyBudgetCurrencySchema.parse(query.budgetCurrency ?? 'COP'),
  };
}

export function rowToRental(r: ApartmentRow): Rental {
  const canScheduleViewing = isRentalRequestable(r);
  const nightlyPrice = nightlyPriceFrom(r);
  const photos = (r.images ?? []).filter((u): u is string => typeof u === 'string' && u.length > 0);
  const externalProvider = externalSourceProvider(r.metadata);
  return rentalSchema.parse({
    id: r.id,
    title: r.title,
    neighborhood: r.neighborhood,
    nightly_price: nightlyPrice,
    currency: (r.currency ?? 'USD').toUpperCase(),
    // Production keeps its existing contract (unknown -> 0). Only the dev preview
    // opts into null so it can say "Bedrooms unknown" instead of a false "Studio".
    bedrooms: r.bedrooms ?? 0,
    wifi: (r.wifi_speed ?? 0) > 0,
    amenities: r.amenities ?? [],
    image: photos[0] ?? '',
    // The Details panel shows `images`; without it a managed listing showed only its cover photo.
    images: photos.length > 0 ? photos.slice(0, RENTAL_PANEL_PHOTO_LIMIT) : undefined,
    photo_count: photos.length > RENTAL_PANEL_PHOTO_LIMIT ? photos.length : undefined,
    source_url: r.source_url ?? `https://mdeai.co/rentals/${r.slug ?? r.id}`,
    source_provider: externalProvider ?? undefined,
    can_schedule_viewing: canScheduleViewing,
    schedule_viewing_url: canScheduleViewing
      ? `https://mdeai.co/rentals/${r.slug ?? r.id}`
      : null,
    host_name: r.host_name ?? 'Host',
    availability: isAvailabilityUnconfirmed(r.metadata)
      ? 'Availability unconfirmed'
      : formatAvailability(r.available_from, r.available_to),
    tags: (() => {
      const tags = deriveTags({
        amenities: r.amenities ?? [],
        pet_friendly: r.pet_friendly,
        parking_included: r.parking_included,
        minimum_stay_days: r.minimum_stay_days,
        wifi_speed: r.wifi_speed,
        price_daily: nightlyPrice,
      });
      if (isSelfAttested(r.metadata)) tags.push('self-attested');
      // Source attribution is independent of eligibility: use the preserved provenance,
      // not the removed inventory_kind/allowed_action markers.
      if (isExternalSourceListing(r.metadata)) tags.push('external-source');
      return tags;
    })(),
    latitude: r.latitude != null ? Number(r.latitude) : undefined,
    longitude: r.longitude != null ? Number(r.longitude) : undefined,
    price_monthly: r.price_monthly != null ? Number(r.price_monthly) : undefined,
  });
}

function formatAvailability(from: string | null, to: string | null): string {
  if (!from) return 'Availability unconfirmed';
  if (to) return `Available ${formatDateOnly(from)} – ${formatDateOnly(to)}`;
  return `Available from ${formatDateOnly(from)}`;
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
  options?: RentalSearchOptions,
): Promise<{ results: Rental[]; total: number; source: 'supabase' }> {
  const client = options?.client ?? getSupabaseClient();
  if (!client) {
    throw new RentalSearchUnavailableError('client_unavailable');
  }

  const limit = query.limit ?? 8;
  // Reuse the caller's already-resolved phase instead of a second RPC round-trip.
  const developmentMode = options?.developmentPhase ?? await readRentalDevelopmentPhase(client);
  // A nightly budget is only comparable within its own currency; see rentalPricePredicate().
  const maxNightly =
    typeof query.maxPricePerNight === 'number' ? query.maxPricePerNight : null;
  const monthlyBudget = monthlyBudgetFromQuery(query);
  // MVP: count:'exact' for accurate browse subtitle (~180 active listings). Revisit
  // estimated/cached counts post-MVP if apartments table grows materially.
  let q = client
    .from('apartments')
    .select(
      'id, title, neighborhood, bedrooms, price_daily, price_monthly, currency, wifi_speed, amenities, images, host_name, source_url, metadata, available_from, available_to, pet_friendly, parking_included, minimum_stay_days, slug, latitude, longitude, status, landlord_id, moderation_status, listing_workflow_status, rental_can_request_viewing',
      { count: 'exact' },
    )
    // ponytail: ordering stays on the stored nightly price, so a monthly-only row sorts after
    // every nightly-priced row and two different currencies are never meaningfully ordered
    // against each other. Comparing 80,000 COP to 78 USD is the same unit error the predicate
    // above refuses to make, so a normalised sort would be a lie dressed as a feature.
    // Upgrade path: once a canonical currency (or an FX source) exists, order by a single
    // normalised price — a generated column or an RPC, not a bigger `or=(...)`.
    .order('price_daily', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (monthlyBudget || maxNightly !== null) {
    q = q.or(rentalBudgetPredicate(maxNightly, monthlyBudget));
  }
  if (!developmentMode) {
    q = q.eq('status', 'active').not('landlord_id', 'is', null);
  }

  if (query.neighborhood) {
    q = q.ilike('neighborhood', `%${query.neighborhood}%`);
  }
  if (typeof query.minBedrooms === 'number') {
    q = q.gte('bedrooms', query.minBedrooms);
  }

  // SAN-486 / SAN-1349: one shared availability rule (known move-in date, full-stay coverage or
  // not expired), with "today" as the America/Bogota date the viewing RPC uses.
  q = applyAvailabilityFilters(q, {
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    today: rentalAvailabilityDate(),
    developmentMode,
  });

  const { data, error, count } = await q;
  if (error) {
    // Only the stable PostgREST/Postgres code travels; the message can carry hosts and ports.
    throw new RentalSearchUnavailableError(`query_failed${error.code ? `:${error.code}` : ''}`);
  }

  let results = ((data ?? []) as ApartmentRow[]).map(rowToRental);
  if (query.stayType === 'monthly') {
    results = sortForMonthlyStay(results);
  }
  return { results, total: count ?? results.length, source: 'supabase' };
}

// Named export for direct workflow calls (sync signature kept for compatibility;
// internally async — callers that need real DB data should await searchRentals())
export async function searchRentals(
  query: RentalQuery,
  options?: RentalSearchOptions,
): Promise<RentalSearchResult> {
  // Direct search callers may bypass the Mastra input schema; validate before
  // intelligent retrieval or a database filter is constructed.
  if (query.budgetCurrency !== undefined) monthlyBudgetCurrencySchema.parse(query.budgetCurrency);
  if (query.maxPriceMonthly !== undefined &&
      (!Number.isFinite(query.maxPriceMonthly) || query.maxPriceMonthly <= 0)) {
    throw new RangeError('Monthly budget must be a finite positive number');
  }
  const limit = query.limit ?? 8;
  const client = options?.client ?? getSupabaseClient();
  // Development inventory is already returned by canonical RLS-backed search.
  // Never add a second, allowlisted external search that can duplicate or hide it.
  const developmentMode = client ? await readRentalDevelopmentPhase(client) : false;

  if (query.queryText?.trim()) {
    try {
      const started = Date.now();
      const intel = await searchRentalsIntelligent(query, { ...options, developmentPhase: developmentMode });
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
      const external = developmentMode ? [] : await getOptionalExternalRentals(query);
      const mixed = mixRentalResults(intel.results, external, limit);
      return {
        results: mixed.results,
        total: intel.total + mixed.distinctExternal,
        budgetNote: budgetNoteFor(query),
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
        describeRentalSearchError(err),
      );
    }
  }

  try {
    const { results, total, source } = await searchRentalsFromSupabase(query, {
      ...options,
      developmentPhase: developmentMode,
    });
    const external = developmentMode ? [] : await getOptionalExternalRentals(query);
    const mixed = mixRentalResults(results, external, limit);
    return {
      results: mixed.results, total: total + mixed.distinctExternal, source,
      budgetNote: budgetNoteFor(query),
    };
  } catch (err) {
    // SAN-1089: there is no demo fallback. An unreadable database is "search unavailable" —
    // a different answer from a healthy query that matched nothing. Log only a stable reason
    // code (or the error class name) — never the driver message, which can carry hostnames,
    // ports or connection details.
    const reason = describeRentalSearchError(err);
    console.error('[search-rentals] rental search unavailable:', reason);
    throw isRentalSearchUnavailable(err) ? err : new RentalSearchUnavailableError(reason);
  }
}

export const searchRentalsTool = createTool({
  id: 'search-rentals',
  description:
    'Search real Supabase Medellín apartment records using phase-aware RLS. Returns cards and the database-computed can_schedule_viewing contract; unpriced listings are shown as price not provided. Development follow-up requests for external-source records are not provider-confirmed appointments. Never invent listing facts or claim a showing is confirmed. Database outages are errors, never no-results.',
  inputSchema: z.object({
    neighborhood: z.string().optional().describe('e.g. Laureles, El Poblado, Envigado'),
    minBedrooms: z.number().int().min(0).optional(),
    maxPricePerNight: z.number().positive().optional().describe('USD per night'),
    maxPriceMonthly: z
      .number()
      .positive()
      .optional()
      .describe(
        'Monthly rent ceiling in the listing currency, e.g. 3500000 with budgetCurrency COP. Applied only to listings already priced in that currency.',
      ),
    budgetCurrency: monthlyBudgetCurrencySchema
      .optional()
      .describe('Three-letter budget currency code (e.g. COP). Defaults to COP.'),
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
    source: z.literal('supabase'),
    budgetNote: z.string().optional(),
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
    const {
      neighborhood,
      minBedrooms,
      maxPricePerNight,
      maxPriceMonthly,
      budgetCurrency,
      limit = 8,
      queryText,
    } = inputData;
    // SAN-1502 PR2: use the caller's own RLS-governed client when the runtime
    // supplied one, so an authorized test actor sees development fixtures and
    // everyone else is unchanged.
    const rentalClient = context?.requestContext?.get(RENTAL_SUPABASE_KEY) as
      | SupabaseClient
      | undefined;
    const options = rentalClient ? { client: rentalClient } : undefined;
    const { results, source, budgetNote, hybridUsed, rankExplanation } = await runAuditedSearch(
      'search-rentals',
      (q: RentalQuery) => searchRentals(q, options),
      { neighborhood, minBedrooms, maxPricePerNight, maxPriceMonthly, budgetCurrency, limit, queryText },
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
      budgetNote,
      hybridUsed,
      rankExplanation,
    };
  },
});
