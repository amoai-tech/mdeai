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

  // `hour12: false` can render midnight as "24" on some ICU builds; V8 returns
  // "00". Normalising with `% 24` maps "24" to 0 *on the same day*, which is the
  // correct wall clock. Removing it would let Date.UTC roll 24h forward and
  // compute the offset for the wrong day — so this modulo is deliberate.
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
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  const s = Number(second ?? 0);

  // Range-check EVERY component before Date.UTC. Date.UTC silently normalises
  // out-of-range values (10:99 → 11:39), and a date round trip only catches the
  // subset of overflows that happen to cross a day boundary — so `10:99`,
  // `10:60` and `10:00:99` would otherwise be accepted and quietly rewritten.
  // `d <= 31` is intentionally only a cheap component bound; the round-trip
  // check below is the authoritative calendar validation for month/day pairs.
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (h > 23 || mi > 59 || s > 59) return null;

  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);

  // Reject impossible calendar dates (2026-02-30 → 2026-03-02) that Date.UTC
  // rolls forward while still looking like the requested day-of-month.
  const probe = new Date(wallAsUtc);
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }

  // First pass lands within a day of the true instant; the second pass resolves
  // the exact offset in force at that instant. For today's fixed-offset Bogotá
  // zone both passes are identical; pass two is insurance against a future
  // timezone-rule change without hard-coding UTC-05:00.
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
