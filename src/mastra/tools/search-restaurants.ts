import { createTool } from '@mastra/core/tools';
import { createClient } from '@supabase/supabase-js';
import { restaurantNameMentioned } from '../lib/restaurant-name-match';
export { restaurantNameMentioned } from '../lib/restaurant-name-match';
import { getSupabaseServerAnonEnv } from '@/lib/supabase/server-env';
import { isDeterministicE2E } from '@/lib/deterministic-e2e';
import { z } from 'zod';
import { extractNeighborhood } from './search-events';
import { runAuditedSearch } from '../lib/run-audited-search';
import { writeSearchLog, type RankExplanationEntry } from '../lib/search-logs';

const cuisineEnum = z.enum([
  'colombian',
  'paisa',
  'seafood',
  'steakhouse',
  'vegetarian',
  'cafe',
  'international',
  'italian',
  'pizza',
  'street-food',
]);

export type PriceTier = '$' | '$$' | '$$$' | '$$$$';

export const restaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuisine: cuisineEnum,
  neighborhood: z.string(),
  /**
   * Qualitative tier derived from the real `price_level` column. Absent (never
   * defaulted) when the catalog row has no price_level.
   */
  priceTier: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
  /**
   * Only set when a provider actually supplies a per-person amount.
   * `public.restaurants` has no such column, so it stays absent for catalog
   * rows instead of being estimated from the price tier (SAN-1468).
   */
  avgPricePerPerson: z.number().optional().describe('USD — only when a real amount exists'),
  currency: z.literal('USD').optional(),
  /** Real provider rating. Absent when unknown — never coerced to 0 (SAN-1468). */
  rating: z.number().min(0).max(5).optional(),
  vibe: z.array(z.string()),
  imageUrl: z.string(),
  sourceUrl: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  // MASTRA-048 enrichment fields (populated by scripts/enrich-places.ts)
  placeId: z.string().nullable().optional().describe('Google Place ID — null until enriched'),
  mapsUrl: z.string().nullable().optional().describe('Canonical Google Maps deep link (placeUri)'),
  aiSummary: z.string().nullable().optional().describe('Gemini-generated 2-sentence venue description'),
});

export type Restaurant = z.infer<typeof restaurantSchema>;
export type Cuisine = z.infer<typeof cuisineEnum>;

/**
 * Browser-CI fixture. `isDeterministicE2E()` gates this to non-production runs so
 * Playwright never needs a live Supabase project — it is NEVER returned to a real
 * user (SAN-1468: a database outage must not become believable fake businesses).
 */
const DETERMINISTIC_E2E_RESTAURANTS: Restaurant[] = [
  {
    id: 'rst_lau_001',
    name: 'Hatoviejo Laureles',
    cuisine: 'paisa',
    neighborhood: 'Laureles',
    priceTier: '$$',
    avgPricePerPerson: 18,
    currency: 'USD',
    rating: 4.5,
    vibe: ['traditional', 'family-friendly', 'live-music-weekends'],
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
    sourceUrl: 'https://mdeai.co/restaurants/rst_lau_001',
    latitude: 6.2516,
    longitude: -75.5898,
  },
  {
    id: 'rst_pob_001',
    name: 'Carmen',
    cuisine: 'international',
    neighborhood: 'El Poblado',
    priceTier: '$$$$',
    avgPricePerPerson: 65,
    currency: 'USD',
    rating: 4.8,
    vibe: ['fine-dining', 'tasting-menu', 'date-night'],
    imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    sourceUrl: 'https://mdeai.co/restaurants/rst_pob_001',
    latitude: 6.2098,
    longitude: -75.5663,
  },
  // Cafés — required by curatedFallback (B-10: FALLBACK_RESTAURANTS had no café entries)
  {
    id: 'rst_lau_cafe_001',
    name: 'Pergamino Café',
    cuisine: 'cafe',
    neighborhood: 'Laureles',
    priceTier: '$',
    avgPricePerPerson: 8,
    currency: 'USD',
    rating: 4.7,
    vibe: ['specialty-coffee', 'third-wave', 'work-friendly', 'wifi'],
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    sourceUrl: 'https://mdeai.co/restaurants/rst_lau_cafe_001',
    latitude: 6.2489,
    longitude: -75.5843,
  },
  {
    id: 'rst_lau_cafe_002',
    name: 'Urbania Café',
    cuisine: 'cafe',
    neighborhood: 'Laureles',
    priceTier: '$',
    avgPricePerPerson: 7,
    currency: 'USD',
    rating: 4.5,
    vibe: ['specialty-coffee', 'quiet', 'neighborhood', 'wifi'],
    imageUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    sourceUrl: 'https://mdeai.co/restaurants/rst_lau_cafe_002',
    latitude: 6.2503,
    longitude: -75.5871,
  },
  {
    id: 'rst_pob_cafe_001',
    name: 'Velvet Café',
    cuisine: 'cafe',
    neighborhood: 'El Poblado',
    priceTier: '$',
    avgPricePerPerson: 9,
    currency: 'USD',
    rating: 4.6,
    vibe: ['specialty-coffee', 'brunch', 'work-friendly', 'wifi'],
    imageUrl: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800',
    sourceUrl: 'https://mdeai.co/restaurants/rst_pob_cafe_001',
    latitude: 6.2091,
    longitude: -75.5672,
  },
];

export type RestaurantQuery = {
  cuisine?: Cuisine;
  neighborhood?: string;
  minRating?: number;
  limit?: number;
  priceTier?: PriceTier;
  userLatitude?: number;
  userLongitude?: number;
  /** Natural-language query — enables hybrid + venue_signals (SEARCH-003). */
  queryText?: string;
};

/**
 * `unavailable` means the catalog could not be read (no client, connection or
 * query error). It is deliberately distinct from an honest empty result, which
 * still reports `supabase` with zero rows. `fallback` is the deterministic
 * browser-CI fixture only.
 */
export type RestaurantSource = 'supabase' | 'fallback' | 'unavailable';

export interface RestaurantRow {
  id: string;
  name: string;
  cuisine_types: string[] | null;
  price_level: number;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  primary_image_url: string | null;
  rating: number | string | null;
  tags: string[] | null;
  // MASTRA-048 enrichment columns (nullable until enrich-places.ts runs)
  google_place_id: string | null;
  maps_url: string | null;
  ai_summary: string | null;
}

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

/** Map DB cuisine_types + description keywords → tool enum (for Zod + filters). */
export function mapCuisineFromTypes(types: string[] | null): Cuisine {
  if (!types?.length) return 'international';
  const blob = types.join(' ').toLowerCase();
  if (blob.includes('vegan') || blob.includes('vegetarian') || blob.includes('plant')) return 'vegetarian';
  if (blob.includes('paisa')) return 'paisa';
  if (blob.includes('seafood') || blob.includes('sushi') || blob.includes('japanese') || blob.includes('peruvian'))
    return 'seafood';
  if (blob.includes('steak') || blob.includes('fine dining') || blob.includes('molecular') || blob.includes('michelin'))
    return 'steakhouse';
  if (blob.includes('coffee') || blob.includes('café') || blob.includes('cafe')) return 'cafe';
  if (blob.includes('street') || blob.includes('food hall') || blob.includes('mercado')) return 'street-food';
  if (blob.includes('colombian') || blob.includes('traditional')) return 'colombian';
  if (blob.includes('pizza')) return 'pizza';
  if (blob.includes('italian')) return 'italian';
  return 'international';
}

/**
 * Map a real `price_level` (1–4) to a qualitative tier.
 * Returns undefined for null/non-finite input — the catalog value is unknown, so
 * no tier is invented (SAN-1468).
 */
export function priceLevelToTier(priceLevel: number | null | undefined): PriceTier | undefined {
  if (priceLevel == null) return undefined;
  const numeric = typeof priceLevel === 'number' ? priceLevel : Number(priceLevel);
  if (!Number.isFinite(numeric)) return undefined;
  const n = Math.min(4, Math.max(1, Math.round(numeric)));
  return (['$', '$$', '$$$', '$$$$'] as const)[n - 1];
}

function num(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/** Use canonical DB names; SAN-1539 reconciles the two former El Cielo identities.
 * The historical hardcoded location labels no longer match source-backed data.
 */
export function restaurantSearchDisplayName(name: string, id: string): string {
  void id; // Keep the existing search contract without stale hardcoded labels.
  return name;
}

function withRestaurantDisplayNames(rows: Restaurant[]): Restaurant[] {
  return rows.map((row) => ({
    ...row,
    name: restaurantSearchDisplayName(row.name, row.id),
  }));
}

export function rowToRestaurant(row: RestaurantRow): Restaurant {
  const rating = num(row.rating);
  const lat = num(row.latitude);
  const lng = num(row.longitude);
  return {
    id: row.id,
    name: row.name,
    cuisine: mapCuisineFromTypes(row.cuisine_types),
    neighborhood: row.neighborhood ?? extractNeighborhood(row.address, row.city),
    priceTier: priceLevelToTier(num(row.price_level)),
    // avgPricePerPerson / currency are intentionally absent: public.restaurants
    // stores no per-person amount, so any number here would be invented.
    rating,
    vibe: row.tags?.length ? row.tags : row.cuisine_types ?? [],
    imageUrl: row.primary_image_url ?? '',
    sourceUrl: `https://mdeai.co/restaurants/${row.id}`,
    latitude: lat,
    longitude: lng,
    // MASTRA-048 enrichment fields — null until enrich-places.ts + cache-ai-summaries.ts run
    placeId: row.google_place_id ?? null,
    mapsUrl: row.maps_url ?? null,
    aiSummary: row.ai_summary ?? null,
  };
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// skipcq: JS-0067 - module-local helper; not browser global scope
function applyRestaurantFilters(rows: Restaurant[], query: RestaurantQuery): Restaurant[] {
  let results = rows.slice();
  if (query.cuisine) {
    results = results.filter((r) => r.cuisine === query.cuisine);
  }
  if (query.neighborhood) {
    const q = query.neighborhood.toLowerCase();
    results = results.filter((r) => r.neighborhood.toLowerCase().includes(q));
  }
  if (query.priceTier) {
    results = results.filter((r) => r.priceTier === query.priceTier);
  }
  if (typeof query.minRating === 'number') {
    const minRating = query.minRating;
    // An unknown rating cannot prove it meets the bar, so it is excluded rather
    // than treated as 0 or as a match.
    results = results.filter((r) => r.rating != null && r.rating >= minRating);
  }
  if (
    typeof query.userLatitude === 'number' &&
    typeof query.userLongitude === 'number'
  ) {
    const userLatitude = query.userLatitude;
    const userLongitude = query.userLongitude;
    results = results
      .map((r) => ({
        r,
        dist:
          r.latitude != null && r.longitude != null
            ? haversineKm(
                userLatitude,
                userLongitude,
                r.latitude,
                r.longitude,
              )
            : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.dist - b.dist)
      .map(({ r }) => r);
  }
  return results;
}

/**
 * Resolve named venues before the hybrid top-N limit. Read the existing
 * public catalog under its canonical RLS and preserve real card/map fields.
 * Returning null means no named match; ordinary discovery uses hybrid search.
 */
async function findNamedRestaurants(
  query: RestaurantQuery,
): Promise<RestaurantSearchResult | null> {
  const text = query.queryText?.trim();
  if (!text) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('restaurants')
    .select('id, name, cuisine_types, price_level, address, city, neighborhood, latitude, longitude, primary_image_url, rating, tags, google_place_id, maps_url, ai_summary')
    .limit(500);

  if (error) {
    console.warn('[search-restaurants] named lookup unavailable:', error.code);
    return null;
  }

  const matches = ((data ?? []) as RestaurantRow[])
    .filter((row) => restaurantNameMentioned(text, row.name));
  if (!matches.length) return null;

  const matched = applyRestaurantFilters(matches.map(rowToRestaurant), query);
  // A definite name hit with conflicting constraints must not return unrelated
  // restaurants from the highly rated default fallback.
  return {
    results: withRestaurantDisplayNames(matched.slice(0, query.limit ?? 5)),
    total: matched.length,
    source: 'supabase',
    hybridUsed: false,
    rankExplanation: [{ factor: 'exact_catalog_name', score: 1, note: 'RLS-protected restaurants.name' }],
  };
}

export type RestaurantSearchResult = {
  results: Restaurant[];
  total: number;
  source: RestaurantSource;
  hybridUsed?: boolean;
  rankExplanation?: RankExplanationEntry[];
};

/**
 * Read the real catalog with structured filters. This is the only path that
 * produces user-visible restaurants; it never substitutes invented rows.
 *
 * The `is_active` predicate is deliberately absent: the catalog RLS policy
 * (`20261016110000_restaurant_development_business_gates.sql`) owns phase-aware
 * visibility as `is_active = true OR phase = 'development'`, so a second filter
 * here only hid development records from legitimate readers (SAN-1468 1.5).
 */
async function searchRestaurantsStructured(
  query: RestaurantQuery,
): Promise<RestaurantSearchResult> {
  const limit = query.limit ?? 5;
  const client = getSupabaseClient();

  if (!client) {
    console.warn('[search-restaurants] Supabase client unavailable');
    return { results: [], total: 0, source: 'unavailable' };
  }

  let q = client
    .from('restaurants')
    .select(
      'id, name, cuisine_types, price_level, address, city, neighborhood, latitude, longitude, primary_image_url, rating, tags, google_place_id, maps_url, ai_summary',
    )
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(100);

  if (query.neighborhood) {
    // Strip PostgREST-special chars (commas, parens, dots) before filter string interpolation.
    const safeNeighborhood = query.neighborhood
      .replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9\s\-]/g, "")
      .trim();
    if (safeNeighborhood) {
      q = q.or(
        `neighborhood.ilike.%${safeNeighborhood}%,address.ilike.%${safeNeighborhood}%,city.ilike.%${safeNeighborhood}%`,
      );
    }
  }

  const { data, error } = await q;

  if (error) {
    console.error('[search-restaurants] Supabase error:', error.message);
    return { results: [], total: 0, source: 'unavailable' };
  }

  const raw = (data ?? []) as RestaurantRow[];
  // Zero rows is an honest empty result from a reachable catalog, not an outage.
  const mapped = applyRestaurantFilters(raw.map(rowToRestaurant), query);
  return {
    results: withRestaurantDisplayNames(mapped.slice(0, limit)),
    total: mapped.length,
    source: 'supabase',
  };
}

export async function searchRestaurants(
  query: RestaurantQuery,
): Promise<RestaurantSearchResult> {
  const limit = query.limit ?? 5;

  // Deterministic browser-CI mode is checked FIRST and applies to every search
  // shape, including natural-language queries. It returns one stable fixture and
  // never reads the catalog, so no CI path depends on network timing or data.
  // isDeterministicE2E() is false in production, so a real visitor never sees it.
  if (isDeterministicE2E()) {
    const filtered = applyRestaurantFilters(DETERMINISTIC_E2E_RESTAURANTS, query);
    return {
      results: withRestaurantDisplayNames(filtered.slice(0, limit)),
      total: filtered.length,
      source: 'fallback',
    };
  }

  if (query.queryText?.trim()) {
    const named = await findNamedRestaurants(query);
    if (named) {
      await writeSearchLog({
        queryText: query.queryText,
        toolName: 'search-restaurants',
        resultsCount: named.total,
        latencyMs: 0,
        hybridUsed: false,
        groundingUsed: true,
        rankExplanation: named.rankExplanation,
      });
      return named;
    }

    const started = Date.now();
    let intel: Awaited<ReturnType<typeof import('../lib/intelligence-restaurant-search').searchRestaurantsIntelligent>> | null = null;
    try {
      // Load after this tool initializes: intelligence search reuses its mapping helpers.
      const { searchRestaurantsIntelligent } = await import('../lib/intelligence-restaurant-search');
      intel = await searchRestaurantsIntelligent(query);
    } catch (err) {
      console.warn('[search-restaurants] intelligent search failed:', err instanceof Error ? err.message : err);
    }
    const latencyMs = Date.now() - started;

    // Apply filters after intelligent search.
    const intelFiltered = intel?.results?.length
      ? applyRestaurantFilters(intel.results, query)
      : [];

    if (intelFiltered.length === 0) {
      // When intelligent search cannot answer, ask the same real, structured
      // catalog instead. Curated inventions are never a substitute (SAN-1468 1.3).
      console.warn('[search-restaurants] intelligent path empty — using structured catalog search');
      const structured = await searchRestaurantsStructured(query);
      await writeSearchLog({
        queryText: query.queryText,
        slots: intel?.slots,
        toolName: 'search-restaurants',
        resultsCount: structured.total,
        latencyMs,
        hybridUsed: false,
        groundingUsed: false,
      });
      return structured;
    }

    // Log final count (after filters) — not pre-filter count.
    await writeSearchLog({
      queryText: query.queryText,
      slots: intel?.slots,
      toolName: 'search-restaurants',
      resultsCount: intelFiltered.length,
      latencyMs,
      hybridUsed: intel?.hybridUsed,
      groundingUsed: false,
      rankExplanation: intel?.rankExplanation,
    });
    return {
      results: withRestaurantDisplayNames(intelFiltered.slice(0, limit)),
      total: intelFiltered.length,
      source: intel?.source ?? 'supabase',
      hybridUsed: intel?.hybridUsed,
      rankExplanation: intel?.rankExplanation,
    };
  }

  return searchRestaurantsStructured(query);
}

export const searchRestaurantsTool = createTool({
  id: 'search-restaurants',
  description:
    'Search Medellín restaurants from Supabase (public.restaurants). Returns real catalog rows only; an unreadable catalog reports source "unavailable" instead of inventing businesses.',
  inputSchema: z.object({
    cuisine: cuisineEnum.optional(),
    neighborhood: z.string().optional().describe('e.g. Laureles, El Poblado, Envigado, Centro'),
    minRating: z.number().min(0).max(5).optional(),
    limit: z.number().int().min(1).max(20).default(5),
    queryText: z
      .string()
      .optional()
      .describe('Natural-language search e.g. quiet rooftop dinner in Provenza'),
  }),
  outputSchema: z.object({
    results: z.array(
      restaurantSchema.extend({
        rankScore: z.number().optional(),
        evidence: z
          .array(
            z.object({
              sourceType: z.string(),
              sourceUrl: z.string().nullable(),
              extractedText: z.string().nullable(),
            }),
          )
          .optional(),
      }),
    ),
    total: z.number(),
    source: z.enum(['supabase', 'fallback', 'unavailable']),
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
  execute: async (inputData: RestaurantQuery, context?: any) => {
    const { cuisine, neighborhood, minRating, limit = 5, queryText } = inputData;
    const { results, total, source, hybridUsed, rankExplanation } = await runAuditedSearch(
      'search-restaurants',
      searchRestaurants,
      {
        cuisine,
        neighborhood,
        minRating,
        limit,
        queryText,
      },
      context,
    );

    return { results, total, source, hybridUsed, rankExplanation };
  },
});
