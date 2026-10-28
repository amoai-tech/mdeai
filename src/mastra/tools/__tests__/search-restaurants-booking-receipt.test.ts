import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { RESTAURANT_BOOKING_SEARCH_KEY } from '../../lib/booking-continuation';

const runSearchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/run-audited-search', () => ({ runAuditedSearch: runSearchMock }));

import { searchRestaurantsTool } from '../search-restaurants';

const restaurant = {
  id: 'a1b2c3d4-e5f6-4789-abcd-100000000005',
  name: 'Verdeo', cuisine: 'vegetarian', neighborhood: 'El Poblado',
  vibe: [], imageUrl: '', sourceUrl: '',
};

async function runSearch(context?: RequestContext) {
  const execute = searchRestaurantsTool.execute;
  if (!execute) throw new Error('Restaurant search tool has no execute');
  return execute({ queryText: 'Verdeo', limit: 5 }, context
    ? { requestContext: context, observe: noopObserve }
    : { observe: noopObserve });
}

beforeEach(() => {
  runSearchMock.mockReset();
});

describe('real search tool writes the SAN-1149 booking receipt', () => {
  it('records only source-backed canonical venue fields when requestContext is available', async () => {
    runSearchMock.mockResolvedValue({ source: 'supabase', results: [restaurant], total: 1 });
    const context = new RequestContext();
    const out = await runSearch(context);
    expect(out).toMatchObject({ source: 'supabase', total: 1 });
    expect(context.get(RESTAURANT_BOOKING_SEARCH_KEY)).toEqual({
      source: 'supabase',
      results: [{ id: restaurant.id, name: 'Verdeo' }],
    });
  });

  it('does not throw when Mastra omits requestContext', async () => {
    runSearchMock.mockResolvedValue({ source: 'supabase', results: [restaurant], total: 1 });
    await expect(runSearch()).resolves.toMatchObject({ source: 'supabase', total: 1 });
  });

  it('does not persist ungrounded fallback rows', async () => {
    runSearchMock.mockResolvedValue({ source: 'fallback', results: [restaurant], total: 1 });
    const context = new RequestContext();
    await runSearch(context);
    expect(context.get(RESTAURANT_BOOKING_SEARCH_KEY)).toEqual({
      source: 'fallback', results: [],
    });
  });
});
