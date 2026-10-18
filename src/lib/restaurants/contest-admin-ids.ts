/**
 * Normalise the restaurant ids submitted by the admin form.
 *
 * A multi-select posts one value per pick; the "add all" button posts a single comma-separated
 * value. Both must collapse to one deduplicated list of non-empty ids.
 *
 * Kept free of `server-only` so it can be unit-tested and reused on either side of the boundary.
 */
export function normalizeRestaurantIds(values: string[]): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}