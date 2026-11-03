/**
 * Normalise the restaurant ids submitted by the admin form.
 *
 * A multi-select posts one value per pick; the "add all" button posts a single comma-separated
 * value. Both collapse to one deduplicated list of VALID uuids: one malformed value must never
 * reach the RPC, where it would abort the whole batch.
 *
 * Kept free of `server-only` so it can be unit-tested and reused on either side of the boundary.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NormalizedRestaurantIds = { ids: string[]; rejected: number };

export function normalizeRestaurantIds(values: string[]): NormalizedRestaurantIds {
  const seen = new Set<string>();
  let rejected = 0;
  for (const value of values) {
    for (const piece of value.split(",")) {
      const candidate = piece.trim();
      if (!candidate) continue;
      if (!UUID_RE.test(candidate)) {
        rejected += 1;
        continue;
      }
      seen.add(candidate.toLowerCase());
    }
  }
  return { ids: [...seen], rejected };
}