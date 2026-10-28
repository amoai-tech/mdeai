import { describe, expect, it } from 'vitest';
import { searchRestaurants } from '../search-restaurants';
import { hasLiveSupabase } from '../../lib/__tests__/live-supabase-gate';

const malDeOjoId = 'b049abc8-2ffd-4f14-ae5c-635d94936385';

describe.skipIf(!hasLiveSupabase())('SAN-1531 named restaurant search — existing live catalog (read only)', () => {
  it.each([
    'Where is Mal De Ojo restaurant in Medellín? Give its street address and cite a source. Do not book anything.',
    'mal de ojo Medellín',
    'Mal De Ojo address',
    'where is Mal de Ojo?',
    'mal ojo de restaurant',
  ])('returns actual Mal De Ojo UUID before the top-five limit: %s', async (queryText) => {
    const r = await searchRestaurants({ queryText, limit: 5 });
    expect(r.source).toBe('supabase');
    expect(r.results[0]?.id).toBe(malDeOjoId);
    expect(r.results[0]?.sourceUrl).toMatch(/\/restaurants\/b049abc8-2ffd-4f14-ae5c-635d94936385$/);
    expect(r.results[0]?.aiSummary).toContain('Calle 8 #43C-68');
    expect(r.results[0]?.address).toBe('Calle 8 #43C-68, Piso 11, Astorga, El Poblado, Medellín');
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.rankExplanation?.[0]?.factor).toBe('exact_catalog_name');
  }, 35_000);

  it.each([
    ['Mondongos Laureles', 'b123769d-525e-4512-b47d-e2753c47f5c7'],
    ['Mondongos Poblado', 'd3e6f78e-a984-4ec2-8938-bcc9a38a16b9'],
  ])('distinguishes a real branch for %s', async (queryText, id) => {
    const r = await searchRestaurants({ queryText, limit: 5 });
    expect(r.results[0]?.id).toBe(id);
    expect(r.total).toBe(1);
  }, 35_000);

  it('returns both real El Cielo locations instead of inventing a branch', async () => {
    const r = await searchRestaurants({ queryText: 'El Cielo', limit: 5 });
    expect(r.results.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r.results.map(x=>x.id)).size).toBe(r.results.length);
    expect(r.results.every(x=>x.name.toLowerCase().startsWith('elcielo'))).toBe(true);
  }, 35_000);

  it('does not return unrelated top-five restaurants when a requested name is absent', async () => {
    const r = await searchRestaurants({
      queryText: 'Where is Restaurant Impossible Fictional Bistro in Medellín? Give its address.',
      namedVenueOnly: true,
      limit: 5,
    });
    expect(r.source).toBe('supabase');
    expect(r.total).toBe(0);
    expect(r.results).toHaveLength(0);
  }, 35_000);

  it('does not replace a named venue with unrelated matches when neighborhood conflicts', async () => {
    const r = await searchRestaurants({ queryText: 'Where is Mal De Ojo?', neighborhood: 'Laureles' });
    expect(r.source).toBe('supabase');
    expect(r.results).toHaveLength(0);
  }, 35_000);
});
