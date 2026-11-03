import { isOrderedStay, isRealCalendarDate } from "./date-only";

/**
 * SAN-1611 — the stay a renter already chose must follow them into the booking review.
 *
 * The browsable stay is `from` (first day) and `through` (last day, inclusive), both
 * Medellín calendar dates. Only a real, ordered range is carried: anything malformed is
 * dropped rather than silently corrected, so the review screen never prefills a date the
 * renter did not choose.
 *
 * DATE MEANING (the one rule): `through` is the **last occupied day**, both inclusive — the
 * availability filter computes `days = (checkOut - checkIn) / DAY + 1`, so Nov 10–15 is a
 * six-day stay. A booking's end date is a **move-out**, i.e. the day after `through`, which is
 * what `moveOutFromStayThrough` produces. Keeping the URL in browse semantics and converting
 * once at the booking boundary avoids an off-by-one in nights and in any future pricing.
 */
type RawParam = string | string[] | undefined;

export type StayRange = { from: string | null; through: string | null };

const first = (value: RawParam): string | null => {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
};

/**
 * One rule for "is this a usable stay": a real move-in, and either no move-out or a real,
 * non-reversed one. Both the parser and the link builder use it, so they cannot disagree.
 */
function isValidStay(from: string, through: string | null): boolean {
  if (!isRealCalendarDate(from)) return false;
  if (through === null) return true;
  return isRealCalendarDate(through) && isOrderedStay(from, through);
}

/** A validated stay, or nulls. A move-out without a move-in is not a stay. */
export function parseStayRange(params: { from?: RawParam; through?: RawParam }): StayRange {
  const rawFrom = first(params.from);
  const rawThrough = first(params.through);
  // A range that is present but not real or not ordered is unusable as a whole. Dropping only the
  // bad end would silently turn a two-date stay into a one-date one.
  if (!rawFrom || !isValidStay(rawFrom, rawThrough)) return { from: null, through: null };
  return { from: rawFrom, through: rawThrough };
}

/** The booking-review URL for one apartment, carrying the stay when one was chosen. */
export function bookingReviewHref(apartmentId: string, stay?: StayRange | null): string {
  const params = new URLSearchParams({ apartment: apartmentId });
  // Validate the whole range here too: callers hand over filters that may still carry a reversed
  // pair (parseBrowseFilters keeps both values so the renter can correct them). Constructing a
  // link from an impossible range would push it downstream where it gets dropped silently.
  const from = stay?.from ?? null;
  const through = stay?.through ?? null;
  if (from && isValidStay(from, through)) {
    params.set("from", from);
    if (through) params.set("through", through);
  }
  return `/rentals/bookings/new?${params.toString()}`;
}

/**
 * `through` is the last occupied day, so the day the renter leaves is the next calendar day.
 * Pure calendar arithmetic in UTC: never `new Date("YYYY-MM-DD") + 1 day` through a local clock,
 * which shifts across a DST boundary or a negative-offset timezone.
 */
export function moveOutFromStayThrough(through: string | null | undefined): string | null {
  if (!through || !isRealCalendarDate(through)) return null;
  const date = new Date(`${through}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
