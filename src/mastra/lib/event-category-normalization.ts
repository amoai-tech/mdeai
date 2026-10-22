/**
 * Small, dependency-free event chip normalization used even when optional
 * search intelligence fails to load. Keep music signals consistent with
 * parseEventIntelligenceSlots in intelligence-event-search.
 */
import type { EventCategory } from '../tools/search-events';

export function eventMusicSignals(queryText: string): {
  wantsSalsa: boolean;
  wantsLiveMusic: boolean;
} {
  const q = queryText.toLowerCase().replace(/-/g, ' ');
  return {
    wantsSalsa: /salsa/.test(q),
    wantsLiveMusic: /live music|concert|band/.test(q),
  };
}

/** CK-V2-015: Nightlife chip alone means broad browse; Nightlife + live music means Music. */
export function resolveEventCategoryForQuery(
  category: EventCategory | undefined,
  queryText?: string,
): EventCategory | undefined {
  if (category !== 'nightlife') return category;
  const text = queryText?.trim();
  if (!text) return undefined;
  const { wantsSalsa, wantsLiveMusic } = eventMusicSignals(text);
  return wantsSalsa || wantsLiveMusic ? 'music' : category;
}
