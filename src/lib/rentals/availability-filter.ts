/**
 * SAN-486 — the one availability filter every rental search path applies to `apartments`.
 *
 * Structured search, free-text (intelligent) search and its canonical-row lookup each used to carry
 * their own copy, and the copies disagreed with the viewing RPC: they let a listing with NO move-in
 * date through (`available_from.is.null`) although the RPC refuses it, so renters were shown
 * listings they could not request. Rules, identical for every caller:
 *
 *  - a listing must have a known move-in date (`available_from` not null);
 *  - with dates: it must start on or before the first day and stay open through the last day, and
 *    the stay length must satisfy its minimum/maximum stay;
 *  - without dates: it must not have expired (`available_to` open or on/after today, Bogotá date).
 *
 * A future move-in is still discoverable with no dates: it is shown as upcoming and can be toured.
 */

/** The slice of a Supabase/PostgREST filter builder this helper needs. */
type FilterChain = {
  or: (filters: string) => FilterChain;
  not: (column: string, operator: string, value: unknown) => FilterChain;
};

export type AvailabilityFilterOptions = {
  checkIn?: string;
  checkOut?: string;
  /** Today's calendar date in America/Bogota, `YYYY-MM-DD`. */
  today: string;
};

const DAY_MS = 86_400_000;

/**
 * Generic over the caller's builder type: Supabase's own recursive builder types make a constrained
 * generic blow the compiler's instantiation depth, so the chain is narrowed internally.
 */
export function applyAvailabilityFilters<Q>(query: Q, { checkIn, checkOut, today }: AvailabilityFilterOptions): Q {
  let q = (query as unknown as FilterChain).not("available_from", "is", null);
  if (checkIn || checkOut) {
    const stayStart = checkIn ?? checkOut!;
    const stayEnd = checkOut ?? checkIn!;
    q = q.or(`available_from.lte.${stayStart}`);
    q = q.or(`available_to.is.null,available_to.gte.${stayEnd}`);
    if (checkIn && checkOut) {
      const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / DAY_MS);
      if (nights > 0) {
        q = q.or(`minimum_stay_days.is.null,minimum_stay_days.lte.${nights}`);
        q = q.or(`maximum_stay_days.is.null,maximum_stay_days.gte.${nights}`);
      }
    }
    return q as unknown as Q;
  }
  return q.or(`available_to.is.null,available_to.gte.${today}`) as unknown as Q;
}
