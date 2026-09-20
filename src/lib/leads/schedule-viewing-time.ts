/**
 * SAN-1203 · Canonical viewing-time contract.
 *
 * The browser `datetime-local` control emits a wall clock with no offset
 * (e.g. `2026-11-03T15:00`). Interpreting that value with the viewer's browser
 * timezone — or with the Vercel process timezone — makes one typed value mean
 * different instants for different people. Medellín listings are scheduled in
 * listing-local time, so every wall clock resolves through the listing
 * timezone before it becomes a canonical UTC instant.
 *
 * The offset is derived with the platform `Intl` API rather than a hard-coded
 * `-05:00` so the contract stays correct if the listing timezone ever observes
 * a DST or offset change again. No timezone library is required.
 */

export const LISTING_TIME_ZONE = "America/Bogota";

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Offset in minutes between the given instant and the same wall clock in `timeZone`. */
function timeZoneOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const value = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second"),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Interpret a `datetime-local` wall clock as listing-local time.
 *
 * @returns the canonical UTC instant as an ISO string, or `null` when the value
 * is not a valid listing-local wall clock.
 */
export function resolvePreferredAtInstant(raw: string): string | null {
  const match = WALL_CLOCK_RE.exec(raw.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const wallAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  );

  // `Date.UTC` silently rolls impossible values over (2026-02-30 → 2026-03-02),
  // so compare the round trip and reject anything that moved.
  const probe = new Date(wallAsUtc);
  if (
    probe.getUTCFullYear() !== Number(year) ||
    probe.getUTCMonth() !== Number(month) - 1 ||
    probe.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  // First pass lands within a day of the true instant; the second pass resolves
  // the exact offset in force at that instant.
  const estimate = wallAsUtc - timeZoneOffsetMinutes(LISTING_TIME_ZONE, new Date(wallAsUtc)) * 60_000;
  const instant = wallAsUtc - timeZoneOffsetMinutes(LISTING_TIME_ZONE, new Date(estimate)) * 60_000;

  return new Date(instant).toISOString();
}

/** Strictly-future check against a canonical instant. */
export function isFutureInstant(instantIso: string, now: Date = new Date()): boolean {
  const instant = new Date(instantIso);
  if (Number.isNaN(instant.getTime())) return false;
  return instant.getTime() > now.getTime();
}
