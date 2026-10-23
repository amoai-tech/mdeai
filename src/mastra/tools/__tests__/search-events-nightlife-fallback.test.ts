import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inFilter, gteFilter, lteFilter, addressFilter } = vi.hoisted(() => ({
  inFilter: vi.fn(),
  gteFilter: vi.fn(),
  lteFilter: vi.fn(),
  addressFilter: vi.fn(),
}));

// Exercise the real tool and query construction; only the network is replaced.
vi.mock('@/lib/supabase/server-env', () => ({
  getSupabaseServerAnonEnv: () => ({
    url: 'https://example.supabase.co',
    anonKey: 'test-only',
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        gte: (column: string, value: string) => { gteFilter(column, value); return query; },
        lte: (column: string, value: string) => { lteFilter(column, value); return query; },
        ilike: (column: string, value: string) => { addressFilter(column, value); return query; },
        in: (column: string, values: string[]) => {
          inFilter(column, values);
          return query;
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    },
  }),
}));

vi.mock('../../lib/intelligence-event-search', () => {
  throw new Error('intelligence module could not initialize');
});

import { dateWindow, searchEvents } from '../search-events';

describe('Nightlife chip when intelligence import fails', () => {
  beforeEach(() => {
    inFilter.mockClear();
    gteFilter.mockClear();
    lteFilter.mockClear();
    addressFilter.mockClear();
  });

  it('does NOT filter event_type when Nightlife chip has no text', async () => {
    const result = await searchEvents({ category: 'nightlife', limit: 5 });
    expect(result.source).toBe('supabase');
    expect(inFilter).not.toHaveBeenCalled();
  });

  it('uses the music category for Nightlife + salsa follow-up', async () => {
    await searchEvents({ category: 'nightlife', queryText: 'live salsa band in Laureles', limit: 5 });
    expect(inFilter).toHaveBeenCalledWith('event_type', expect.arrayContaining(['music', 'Music']));
    expect(inFilter.mock.calls.some(([, values]) => values.includes('nightlife'))).toBe(false);
  });

  it('preserves weekend and Laureles from text when intelligence import fails', async () => {
    await searchEvents({ queryText: 'salsa events this weekend in Laureles', limit: 5 });
    const weekend = dateWindow('this_weekend');
    expect(addressFilter).toHaveBeenCalledWith('address', '%Laureles%');
    expect(gteFilter).toHaveBeenCalledWith('event_start_time', weekend.gte);
    expect(lteFilter).toHaveBeenCalledWith('event_start_time', weekend.lte);
  });

  it('preserves explicit chip filters ahead of inferred slots on fallback', async () => {
    await searchEvents({
      queryText: 'salsa events this weekend in Laureles',
      neighborhood: 'El Poblado',
      dateWindow: 'tonight',
      limit: 5,
    });
    const tonight = dateWindow('tonight');
    expect(addressFilter).toHaveBeenCalledWith('address', '%El Poblado%');
    expect(gteFilter).toHaveBeenCalledWith('event_start_time', tonight.gte);
    expect(lteFilter).toHaveBeenCalledWith('event_start_time', tonight.lte);
  });

  it('reports the import failure message rather than just its Error class', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await searchEvents({ queryText: 'salsa music', limit: 5 });
      expect(warn).toHaveBeenCalledWith(
        '[search-events] intelligence module unavailable, using structured search:',
        expect.stringMatching(/mocking a module|intelligence module could not initialize/),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
