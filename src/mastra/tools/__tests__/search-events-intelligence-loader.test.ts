import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server-env', () => ({
  getSupabaseServerAnonEnv: () => null,
}));

// A missing/unavailable optional intelligence module must not take down the
// existing structured search tool or an entire Mastra search turn.
vi.mock('../../lib/intelligence-event-search', () => {
  throw new Error('intelligence module could not initialize');
});

import { searchEvents } from '../search-events';

describe('search-events optional intelligence startup', () => {
  it('falls back safely for structured category searches', async () => {
    await expect(searchEvents({ category: 'music', limit: 5 })).resolves.toEqual({
      results: [],
      total: 0,
      source: 'fallback',
    });
  });

  it('falls back safely for natural-language event searches', async () => {
    await expect(searchEvents({ queryText: 'salsa events this weekend', limit: 5 })).resolves.toEqual({
      results: [],
      total: 0,
      source: 'fallback',
    });
  });
});
