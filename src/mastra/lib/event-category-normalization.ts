/**
 * Small, dependency-free event chip normalization used even when optional
 * search intelligence fails to load. Keep music signals consistent with
 * parseEventIntelligenceSlots in intelligence-event-search.
 */
import type { DateWindow, EventCategory } from '../tools/search-events';

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

export type EventIntelligenceSlots = {
  neighborhood?: string;
  wantsSalsa?: boolean;
  wantsLiveMusic?: boolean;
  wantsFashion?: boolean;
  wantsNetworking?: boolean;
  dateWindow?: DateWindow;
};

/** Dependency-free slots shared by the intelligent and structured fallback paths. */
export function parseEventIntelligenceSlots(queryText: string): EventIntelligenceSlots {
  const q = queryText.toLowerCase().replace(/-/g, ' ');
  const slots: EventIntelligenceSlots = {};
  if (/laureles/.test(q)) slots.neighborhood = 'Laureles';
  else if (/poblado|provenza/.test(q)) slots.neighborhood = 'El Poblado';
  const music = eventMusicSignals(q);
  if (music.wantsSalsa) slots.wantsSalsa = true;
  if (music.wantsLiveMusic) slots.wantsLiveMusic = true;
  if (/fashion|runway/.test(q)) slots.wantsFashion = true;
  if (/networking|meetup|professional/.test(q)) slots.wantsNetworking = true;
  if (/this weekend|weekend/.test(q)) slots.dateWindow = 'this_weekend';
  else if (/tonight|today/.test(q)) slots.dateWindow = 'tonight';
  return slots;
}
