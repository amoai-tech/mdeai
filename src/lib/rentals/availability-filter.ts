/**
 * SAN-486 — the one availability filter every rental search path applies to `apartments`.
 *
 * Structured search, free-text (intelligent) search and its canonical-row lookup each used to carry
 * their own copy, and the copies disagreed with the viewing RPC: they let a listing with NO move-in
 * date through (`available_from.is.null`) although the RPC refuses it, so renters were shown
 * listings they could not request. Rules, identical for every caller:
 *
 *  - a listing with a requested stay date must have a known move-in date;
 *  - with dates (From = first day, Through = last day, both inclusive): it must start on or before
 *    the first day and stay open through the last day, and the stay length in days (Nov 1–30 = 30)
 *    must satisfy its minimum/maximum stay;
 *  - without dates: move-in may be unknown; the listing must not have expired (`available_to` open or on/after today, Bogotá date).
 *
 * A future move-in is still discoverable with no dates: it is shown as upcoming and can be toured.
 *
 * During the development phase an explicit stay is still evaluated: a listing whose KNOWN dates
 * conflict with the requested stay (starts after it, ends before it, or is too short/long) is not a
 * match. A development listing with NO confirmed move-in date stays discoverable instead of being
 * hidden, and its card says "Availability unconfirmed" — it is never presented as a confirmed
 * whole-stay match. No business paperwork gates any of this.
 */

import { isRealCalendarDate } from "@/lib/rentals/date-only";

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
  /** Explicitly server-owned development phase; no inventory paperwork gating. */
  developmentMode?: boolean;
};

const DAY_MS = 86_400_000;

/**
 * Generic over the caller's builder type: Supabase's own recursive builder types make a constrained
 * generic blow the compiler's instantiation depth, so the chain is narrowed internally.
 */
export function applyAvailabilityFilters<Q>(query: Q, { checkIn, checkOut, today, developmentMode }: AvailabilityFilterOptions): Q {
  // The dates are written into PostgREST filter strings, where a stray comma or dot would add a
  // condition of its own. Callers validate at their boundary; this guards the helper itself so a
  // future caller that forgets cannot put free text into a filter.
  for (const [name, value] of [["checkIn", checkIn], ["checkOut", checkOut], ["today", today]] as const) {
    if (value && !isRealCalendarDate(value)) {
      throw new RangeError(`applyAvailabilityFilters: ${name} must be a real YYYY-MM-DD date`);
    }
  }
  let q = (query as unknown as FilterChain);
  if (checkIn || checkOut) {
    const stayStart = checkIn ?? checkOut!;
    const stayEnd = checkOut ?? checkIn!;
    // From..Through are the first and LAST occupied day, so Nov 1–30 is a 30-day stay (not 29).
    const days =
      checkIn && checkOut
        ? Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / DAY_MS) + 1
        : null;
    // The listing must be free through the last requested day and honour the stay length. These
    // hold whether or not the move-in date is known.
    const coverage = [`or(available_to.is.null,available_to.gte.${stayEnd})`];
    if (days && days > 0) {
      coverage.push(`or(minimum_stay_days.is.null,minimum_stay_days.lte.${days})`);
      coverage.push(`or(maximum_stay_days.is.null,maximum_stay_days.gte.${days})`);
    }
    // A stored move-in date is only CONFIRMED when its metadata does not flag it as simulated or
    // unverified (15 live development rows carry such a date; all are active and requestable).
    // Flagged rows stay discoverable and are labelled "Availability unconfirmed" instead of being
    // treated as a proven whole-stay match.
    // ponytail: the launch phase still requires a known date; apply the same flag exclusion there
    // when the launch gates are armed, so an unconfirmed date is never a launch claim either.
    const unconfirmedDate = [
      "metadata->>test_available_from_simulated.eq.true",
      "metadata->>availability_status.eq.unconfirmed",
      "metadata->>availability_status.eq.source_claim_unverified",
      "metadata->>available_from_basis.eq.source_for_rent_dates_unconfirmed",
    ].join(",");
    if (developmentMode) {
      // An unknown or unconfirmed move-in date stays discoverable and is labelled "Availability
      // unconfirmed" — but it is not a free pass: a KNOWN end date or stay-length conflict still
      // excludes it, and a confirmed date still has to start on or before the requested day.
      q = q.or(
        `and(or(available_from.is.null,available_from.lte.${stayStart},${unconfirmedDate}),${coverage.join(",")})`,
      );
      return q as unknown as Q;
    }
    q = q.not("available_from", "is", null);
    q = q.or(`available_from.lte.${stayStart}`);
    q = q.or(`available_to.is.null,available_to.gte.${stayEnd}`);
    if (days && days > 0) {
      q = q.or(`minimum_stay_days.is.null,minimum_stay_days.lte.${days}`);
      q = q.or(`maximum_stay_days.is.null,maximum_stay_days.gte.${days}`);
    }
    return q as unknown as Q;
  }
  return q.or(`available_to.is.null,available_to.gte.${today}`) as unknown as Q;
}
