/**
 * Calendar-date helpers for rental availability (SAN-486).
 *
 * Postgres DATE values are plain calendar dates with no timezone. Parsing them with
 * `new Date('YYYY-MM-DD')` anchors them at UTC midnight, so rendering them in any
 * UTC-negative zone (all of the Americas) shows the previous day. These helpers format
 * the stored calendar day directly, so cards, details, search and the assistant agree.
 */

const dateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const calendarFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Format a Postgres DATE (`YYYY-MM-DD`) without shifting it across timezones. */
export function formatDateOnly(d: string): string {
  return dateOnlyFormatter.format(new Date(`${d}T00:00:00Z`));
}

/** Today's calendar date in the rental availability timezone (America/Bogota). */
export function rentalToday(now: Date = new Date()): string {
  return calendarFormatter.format(now);
}

/** True when a DATE is after today in the rental availability timezone. */
export function isFutureDate(d: string | null, now: Date = new Date()): boolean {
  if (!d) return false;
  return d > rentalToday(now);
}
