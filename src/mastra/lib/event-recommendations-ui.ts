/**
 * Builds the A2UI surface operation for real event cards.
 *
 * The model chooses *which* events (plain IDs). This function owns the operation
 * structure, so the runtime always receives a valid `createSurface` with a
 * container root and one grounded EventCard per ID. The model never authors
 * component trees, titles, prices or other event facts.
 */
export const EVENT_RECOMMENDATIONS_TARGET = "event-recommendations";
/** One stable surface id: a new search replaces the previous cards instead of stacking. */
export const EVENT_RECOMMENDATIONS_SURFACE_ID = "event-recommendations";
const A2UI_VERSION = "1.0";
const MAX_CARDS = 4;

export type EventRecommendationOps = {
  target: string;
  operations: Array<Record<string, unknown>>;
};

/** Bounded, unique, opaque IDs only. The card revalidates each against real results. */
/** Keep only bounded, unique, opaque event ids, capped at four cards. */
export function normalizeEventRecommendationIds(input: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === MAX_CARDS) break;
  }
  return ids;
}

/** Build the server-owned createSurface operation for the given authorized event ids. */
export function buildEventRecommendationOps(
  ids: readonly string[],
  surfaceId: string = EVENT_RECOMMENDATIONS_SURFACE_ID,
  options: { replace?: boolean } = {},
): EventRecommendationOps | null {
  const safe = normalizeEventRecommendationIds(ids);
  if (safe.length === 0) return null;
  const cardIds = safe.map((_, index) => `card-${index + 1}`);
  return {
    target: EVENT_RECOMMENDATIONS_TARGET,
    operations: [
      // A2UI rejects createSurface for an id that already exists, so a re-search
      // deletes the previous surface first and re-creates it in the same call.
      ...(options.replace ? [{ version: A2UI_VERSION, deleteSurface: { surfaceId } }] : []),
      {
        version: A2UI_VERSION,
        createSurface: {
          surfaceId,
          components: [
            { id: "root", component: "Column", children: cardIds },
            ...safe.map((eventId, index) => ({
              id: cardIds[index],
              component: "EventCard",
              eventId,
            })),
          ],
        },
      },
    ],
  };
}

/**
 * An empty event search clears the events surface, so a previous result set never
 * stays on screen as if it answered the new question.
 */
export function buildEventClearOps(
  surfaceId: string = EVENT_RECOMMENDATIONS_SURFACE_ID,
): EventRecommendationOps {
  return {
    target: EVENT_RECOMMENDATIONS_TARGET,
    operations: [{ version: A2UI_VERSION, deleteSurface: { surfaceId } }],
  };
}
