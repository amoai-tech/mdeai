export type ClosestGroundedRow = {
  title?: string;
  distanceMeters?: number;
  distanceFromRentalId?: string;
};

export type GroundedRankMode = "closest" | "farthest";

export type ClosestGroundedResult = {
  title: string;
  distanceMeters: number;
  /** True when some rows had no defensible measurement for the current anchor. */
  partial: boolean;
};

/**
 * Deterministic closest/farthest result for the current apartment. Only distances
 * that belong to `selectedListingId` and are finite, non-negative numbers count.
 */
export function closestGroundedResult(
  rows: readonly ClosestGroundedRow[] | undefined,
  selectedListingId: string | undefined,
  mode: GroundedRankMode = "closest",
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
  const best = measured.reduce((a, b) => {
    const av = a.distanceMeters as number;
    const bv = b.distanceMeters as number;
    return mode === "farthest" ? (bv > av ? b : a) : bv < av ? b : a;
  });
  return {
    title: (best.title as string).trim(),
    distanceMeters: Math.round(best.distanceMeters as number),
    partial: measured.length < rows.length,
  };
}

/**
 * A follow-up about the results already shown, not a new search. New-search
 * wording ("near this apartment", "show", "find") must fall through, and only
 * shown-place nouns qualify so "nearest restaurant" is not answered with cafés.
 */
export function parseGroundedRankQuestion(text: string): GroundedRankMode | null {
  if (!/\b(which|who)\b/i.test(text)) return null;
  if (/\b(near|around|within|show|find|search|new)\b/i.test(text)) return null;
  if (!/\b(caf[eé]s?|place|one|these|them|option)/i.test(text)) return null;
  if (/\b(farthest|furthest)\b/i.test(text)) return "farthest";
  if (/\b(closest|nearest)\b/i.test(text)) return "closest";
  return null;
}
