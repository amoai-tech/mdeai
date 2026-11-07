export type ClosestGroundedRow = {
  title?: string;
  distanceMeters?: number;
  distanceFromRentalId?: string;
};

export type ClosestGroundedResult = {
  title: string;
  distanceMeters: number;
  /** True when some rows had no defensible measurement for the current anchor. */
  partial: boolean;
};

/**
 * Deterministic closest result for the current apartment. Only distances that
 * belong to `selectedListingId` and are finite, non-negative numbers count.
 */
export function closestGroundedResult(
  rows: readonly ClosestGroundedRow[] | undefined,
  selectedListingId: string | undefined,
): ClosestGroundedResult | null {
  if (!selectedListingId || !rows?.length) return null;
  const measured = rows.filter(
    (row) =>
      row.distanceFromRentalId === selectedListingId &&
      typeof row.distanceMeters === "number" &&
      Number.isFinite(row.distanceMeters) &&
      row.distanceMeters >= 0 &&
      typeof row.title === "string" &&
      row.title.trim().length > 0,
  );
  if (measured.length === 0) return null;
  const best = measured.reduce((a, b) =>
    (b.distanceMeters as number) < (a.distanceMeters as number) ? b : a,
  );
  return {
    title: (best.title as string).trim(),
    distanceMeters: Math.round(best.distanceMeters as number),
    partial: measured.length < rows.length,
  };
}

export function isClosestGroundedQuestion(text: string): boolean {
  return /\b(closest|nearest|farthest|furthest)\b/i.test(text);
}
