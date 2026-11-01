import { isOrderedStay, isRealCalendarDate } from "./date-only";

/**
 * SAN-1611 — the stay a renter already chose must follow them into the booking review.
 *
 * The browsable stay is `from` (first day) and `through` (last day, inclusive), both
 * Medellín calendar dates. Only a real, ordered range is carried: anything malformed is
 * dropped rather than silently corrected, so the review screen never prefills a date the
 * renter did not choose.
 *
 * `through` is passed to the booking as the end date without arithmetic. The browse filter
 * already treats it as the departure day (`searchRentals` receives it as `checkOut`), so the
 * review screen and the search agree on what "Nov 10–15" means.
 */
type RawParam = string | string[] | undefined;

export type StayRange = { from: string | null; through: string | null };

const first = (value: RawParam): string | null => {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
};

/** A validated stay, or nulls. A move-out without a move-in is not a stay. */
export function parseStayRange(params: { from?: RawParam; through?: RawParam }): StayRange {
  const rawFrom = first(params.from);
  const rawThrough = first(params.through);
  const from = rawFrom && isRealCalendarDate(rawFrom) ? rawFrom : null;
  if (!from) return { from: null, through: null };
  const through =
    rawThrough && isRealCalendarDate(rawThrough) && isOrderedStay(from, rawThrough) ? rawThrough : null;
  return { from, through };
}

/** The booking-review URL for one apartment, carrying the stay when one was chosen. */
export function bookingReviewHref(apartmentId: string, stay?: StayRange | null): string {
  const params = new URLSearchParams({ apartment: apartmentId });
  if (stay?.from) {
    params.set("from", stay.from);
    if (stay.through) params.set("through", stay.through);
  }
  return `/rentals/bookings/new?${params.toString()}`;
}
