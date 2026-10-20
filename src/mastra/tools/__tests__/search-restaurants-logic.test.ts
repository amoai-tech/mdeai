import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapCuisineFromTypes, priceLevelToTier, estimateAvgPriceFromLevel, restaurantSchema, searchRestaurants, restaurantSearchDisplayName } from '../search-restaurants.js';

vi.mock('../../lib/intelligence-restaurant-search', () => ({
  searchRestaurantsIntelligent: vi.fn().mockResolvedValue({ results: [], hybridUsed: false }),
}));
vi.mock('../../lib/search-logs', () => ({
  writeSearchLog: vi.fn().mockResolvedValue(null),
}));

describe('mapCuisineFromTypes', () => {
  it('maps Colombian / traditional to colombian', () => {
    expect(mapCuisineFromTypes(['Colombian', 'Traditional'])).toBe('colombian');
  });

  it('maps vegan / vegetarian to vegetarian', () => {
    expect(mapCuisineFromTypes(['Vegan', 'Healthy'])).toBe('vegetarian');
  });

  it('maps Japanese / Peruvian toward seafood', () => {
    expect(mapCuisineFromTypes(['Japanese', 'Peruvian'])).toBe('seafood');
  });

  it('returns international for empty or unknown', () => {
    expect(mapCuisineFromTypes(null)).toBe('international');
    expect(mapCuisineFromTypes([])).toBe('international');
    expect(mapCuisineFromTypes(['Quantum'])).toBe('international');
  });
});

describe('priceLevelToTier', () => {
  it('maps 1–4 to dollar tiers', () => {
    expect(priceLevelToTier(1)).toBe('$');
    expect(priceLevelToTier(2)).toBe('$$');
    expect(priceLevelToTier(3)).toBe('$$$');
    expect(priceLevelToTier(4)).toBe('$$$$');
  });

  it('clamps out-of-range levels', () => {
    expect(priceLevelToTier(0)).toBe('$');
    expect(priceLevelToTier(99)).toBe('$$$$');
  });
});

describe('estimateAvgPriceFromLevel', () => {
  it('returns monotonic anchors', () => {
    expect(estimateAvgPriceFromLevel(1)).toBeLessThan(estimateAvgPriceFromLevel(4));
  });
});

describe('searchRestaurants — intelligent search fallback', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to curated list when intelligent search returns empty results', async () => {
    const result = await searchRestaurants({ queryText: 'rooftop dinner Provenza', limit: 5 });
    expect(result.source).toBe('fallback');
    expect(result.results.length).toBeGreaterThan(0);
  });
});

describe('El Cielo labels in the intelligent chat search path', () => {
  it('preserves both real result IDs and distinguishes their on-screen names', async () => {
    const { searchRestaurantsIntelligent } = await import('../../lib/intelligence-restaurant-search');
    const base = {
      cuisine: 'international', neighborhood: 'El Poblado', priceTier: '$$$',
      avgPricePerPerson: 30, currency: 'USD', rating: 4.5, vibe: [], imageUrl: '',
      sourceUrl: 'https://mdeai.co/restaurants/example',
    };
    vi.mocked(searchRestaurantsIntelligent).mockResolvedValueOnce({
      results: [
        { ...base, id: 'fc6031d7-dcf6-44c3-9547-f7172c37ee95', name: 'El Cielo' },
        { ...base, id: 'a1b2c3d4-e5f6-4789-abcd-100000000004', name: 'El Cielo' },
      ],
      source: 'supabase', hybridUsed: false,
    } as never);

    const result = await searchRestaurants({ queryText: 'restaurants in El Poblado', limit: 5 });
    expect(result.results.map(({ id, name }) => [id, name])).toEqual([
      ['fc6031d7-dcf6-44c3-9547-f7172c37ee95', 'El Cielo · Elcielo Hotel'],
      ['a1b2c3d4-e5f6-4789-abcd-100000000004', 'El Cielo · Carrera 40'],
    ]);
  });
});

describe('neighborhood sanitization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('strips PostgREST special chars from neighborhood before filter', async () => {
    for (const name of [
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ]) {
      vi.stubEnv(name, '');
    }
    vi.resetModules();
    const { searchRestaurants: isolatedSearch } = await import('../search-restaurants.js');
    const result = await isolatedSearch({
      neighborhood: "Laureles,),*weird'input",
      limit: 5,
    });
    expect(result.source).toBe('fallback');
  });
});

// MASTRA-048 enrichment field schema tests
// These prove that mapsUrl and aiSummary are declared in the schema
// and pass through correctly — values when enriched, null when not yet enriched.
const baseRestaurant = {
  id: 'test-001',
  name: 'Test Restaurant',
  cuisine: 'colombian' as const,
  neighborhood: 'El Poblado',
  priceTier: '$$$' as const,
  avgPricePerPerson: 30,
  currency: 'USD' as const,
  rating: 4.5,
  vibe: ['cozy'],
  imageUrl: 'https://example.com/img.jpg',
  sourceUrl: 'https://mdeai.co/restaurants/test-001',
};

describe('restaurantSchema — MASTRA-048 enrichment fields', () => {
  it('accepts mapsUrl and aiSummary when enriched', () => {
    const result = restaurantSchema.parse({
      ...baseRestaurant,
      placeId: 'ChIJ_abc123',
      mapsUrl: 'https://maps.google.com/?cid=12345',
      aiSummary: 'A top Colombian spot in El Poblado. Great bandeja paisa.',
    });
    expect(result.mapsUrl).toBe('https://maps.google.com/?cid=12345');
    expect(result.aiSummary).toBe('A top Colombian spot in El Poblado. Great bandeja paisa.');
    expect(result.placeId).toBe('ChIJ_abc123');
  });

  it('accepts null mapsUrl and aiSummary when not yet enriched', () => {
    const result = restaurantSchema.parse({
      ...baseRestaurant,
      mapsUrl: null,
      aiSummary: null,
    });
    expect(result.mapsUrl).toBeNull();
    expect(result.aiSummary).toBeNull();
  });

  it('accepts missing mapsUrl and aiSummary (unenriched row — undefined)', () => {
    const result = restaurantSchema.parse(baseRestaurant);
    expect(result.mapsUrl).toBeUndefined();
    expect(result.aiSummary).toBeUndefined();
  });
});


describe('restaurant search display names — real El Cielo locations', () => {
  it('distinguishes both venues without changing their stored names or IDs', () => {
    expect(restaurantSearchDisplayName('El Cielo', 'fc6031d7-dcf6-44c3-9547-f7172c37ee95'))
      .toBe('El Cielo · Elcielo Hotel');
    expect(restaurantSearchDisplayName('El Cielo', 'a1b2c3d4-e5f6-4789-abcd-100000000004'))
      .toBe('El Cielo · Carrera 40');
  });

  it('does not rename any other restaurants or unknown El Cielo records', () => {
    expect(restaurantSearchDisplayName('El Cielo', 'some-other-id')).toBe('El Cielo');
    expect(restaurantSearchDisplayName('El Cielo Café', 'fc6031d7-dcf6-44c3-9547-f7172c37ee95'))
      .toBe('El Cielo Café');
  });
});
