/**
 * Builds the A2UI surface operation for real rental cards.
 *
 * The model chooses *which* apartments (plain IDs). This function owns the
 * operation structure, so the runtime always receives a valid versioned
 * `createSurface` with a container root and one grounded card per ID. The model
 * never authors component trees, prices, titles or other listing facts.
 */
export const RENTAL_RECOMMENDATIONS_TARGET = "rental-recommendations";
const A2UI_VERSION = "1.0";
const MAX_CARDS = 4;

export type RentalRecommendationOps = {
  target: string;
  operations: Array<Record<string, unknown>>;
};

/** Bounded, unique, opaque IDs only. The card revalidates each against real results. */
export function normalizeRecommendationIds(input: readonly unknown[]): string[] {
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

export function buildRentalRecommendationOps(
  ids: readonly string[],
  surfaceId: string,
): RentalRecommendationOps | null {
  const safe = normalizeRecommendationIds(ids);
  if (safe.length === 0) return null;
  const cardIds = safe.map((_, index) => `card-${index + 1}`);
  return {
    target: RENTAL_RECOMMENDATIONS_TARGET,
    operations: [
      {
        version: A2UI_VERSION,
        createSurface: {
          surfaceId,
          components: [
            { id: "root", component: "Column", children: cardIds },
            ...safe.map((listingId, index) => ({
              id: cardIds[index],
              component: "RentalCard",
              listingId,
            })),
          ],
        },
      },
    ],
  };
}
