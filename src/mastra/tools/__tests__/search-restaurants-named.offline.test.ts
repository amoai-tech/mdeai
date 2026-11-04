import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  error: null as { code: string } | null,
  column: '',
  predicate: '',
  config: '',
  cap: 0,
  queried: 0,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'restaurants') throw Error('unexpected table ' + table);
      fake.queried++;
      return {
        select: () => ({
          textSearch: (column: string, predicate: string, config: { config: string }) => {
            fake.column = column;
            fake.predicate = predicate;
            fake.config = config.config;
            return {
              order: () => ({
                limit: async (cap: number) => {
                  fake.cap = cap;
                  return { data: fake.rows.slice(0, cap), error: fake.error };
                },
              }),
            };
          },
        }),
      };
    },
  }),
}));
vi.mock('@/lib/supabase/server-env', () => ({
  getSupabaseServerAnonEnv: () => ({ url: 'https://example.test', anonKey: 'offline-test-not-a-secret' }),
}));
vi.mock('@/lib/deterministic-e2e', () => ({ isDeterministicE2E: () => false }));
vi.mock('../../lib/search-logs', () => ({ writeSearchLog: vi.fn() }));
vi.mock('../../lib/intelligence-restaurant-search', () => ({
  searchRestaurantsIntelligent: vi.fn(async () => ({
    results: [], total: 0, hybridUsed: false, source: 'supabase', rankExplanation: [],
  })),
}));

import { searchRestaurants } from '../search-restaurants';

const row = (name: string, id: string) => ({
  id, name, cuisine_types: ['Colombian'], price_level: 2,
  address: 'Actual catalog street', city: 'Medellín', neighborhood: 'El Poblado',
  latitude: 6.2, longitude: -75.5, primary_image_url: null, rating: 4.5,
  tags: [], google_place_id: null, maps_url: null, ai_summary: null,
});

describe('SAN-1531 name-first indexed catalog contract — deterministic offline CI', () => {
  beforeEach(() => {
    fake.rows = [];
    fake.error = null;
    fake.column = '';
    fake.predicate = '';
    fake.config = '';
    fake.cap = 0;
    fake.queried = 0;
  });

  it('prefers the real named venue even among unrelated higher-ranked candidates', async () => {
    fake.rows = [
      ...Array.from({ length: 6 }, (_, i) => row('Unrelated Bistro ' + i, 'other-' + i)),
      row('Mal De Ojo', 'real-uuid'),
    ];
    const result = await searchRestaurants({
      queryText: 'Where is Mal De Ojo restaurant in Medellín? Give its address and cite a source. Do not book anything.',
      namedVenueOnly: true, limit: 5,
    });
    expect(result.results.map((item) => item.id)).toEqual(['real-uuid']);
    expect(result.rankExplanation?.[0]?.factor).toBe('exact_catalog_name');
    expect(result.results[0]?.address).toBe('Actual catalog street');
    expect(fake.column).toBe('fts_content');
    expect(fake.config).toBe('spanish');
    expect(fake.predicate).toContain('mal:*');
    expect(fake.predicate).toContain('ojo:*');
    expect(fake.cap).toBeLessThanOrEqual(100);
  });

  it('distinguishes matching branches and does not invent or substitute a no-match', async () => {
    fake.rows = [
      row('Mondongos Laureles', 'laureles-uuid'),
      row('Mondongos Poblado', 'poblado-uuid'),
    ];
    const matched = await searchRestaurants({queryText: 'Mondongos Laureles', namedVenueOnly: true});
    expect(matched.results.map((r) => r.id)).toEqual(['laureles-uuid']);
    const missing = await searchRestaurants({queryText: 'Where is Fictional Bistro?', namedVenueOnly: true});
    expect(missing.source).toBe('supabase');
    expect(missing.results).toEqual([]);
  });

  it('returns unavailable on DB error, never a verified no-match', async () => {
    fake.error = { code: 'XX000' };
    const result = await searchRestaurants({queryText:'Where is Mal De Ojo?',namedVenueOnly:true});
    expect(result.source).toBe('unavailable');
    expect(result.results).toEqual([]);
  });

  it('returns unavailable rather than silently truncating named locations', async () => {
    fake.rows = Array.from({length:100}, (_,i) => row('Elcielo Location '+i, 'id-'+i));
    const result = await searchRestaurants({queryText:'Where is El Cielo?', namedVenueOnly:true});
    expect(fake.cap).toBe(81);
    expect(result.source).toBe('unavailable');
  });

  it('never submits a full-catalog read when the input has no searchable name', async () => {
    const result = await searchRestaurants({queryText:'Where is it?', namedVenueOnly:true});
    expect(fake.queried).toBe(0);
    expect(result.source).toBe('unavailable');
  });
});
