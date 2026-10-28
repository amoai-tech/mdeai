/**
 * Medellín venue requests are wall-clock appointments in America/Bogota.
 * datetime-local has no timezone and must NOT be interpreted in the browser's.
 * This conversion is scoped to sourced Medellín venue journeys, not an
 * arbitrary place in another timezone.
 */
export const MEDELLIN_TIME_ZONE = "America/Bogota";

export function medellinLocalToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid Medellín date and time.");
  const [, year, month, day, hour, minute] = match;
  const iso = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-05:00`);
  if (Number.isNaN(iso.getTime()) ||
      medellinIsoToLocal(iso.toISOString()) !== value) {
    throw new Error("Choose a valid Medellín date and time.");
  }
  return iso.toISOString();
}

export function medellinIsoToLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid booking date.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEDELLIN_TIME_ZONE, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatMedellinBookingTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MEDELLIN_TIME_ZONE, weekday: "short", month: "short",
    day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date) + " (Medellín)";
}

/** Accept model-proposed timezone-aware ISO (Z or offset) and Medellín wall-clock
 * ISO without a zone. Always return a single UTC instant for display, database
 * storage and the idempotency key — never use the viewer's browser timezone.
 */
export function normalizeVenueBookingRequestedAt(value: string): string {
  const raw = value.trim();
  const shape = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?([zZ]|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.exec(raw);
  if (!shape) throw new Error("Enter a valid booking date and time.");
  const [, year, month, day] = shape;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() + 1 !== Number(month) ||
      calendar.getUTCDate() !== Number(day)) throw new Error("Invalid booking calendar date.");
  const hasZone = Boolean(shape[8]);
  const withZone = hasZone ? raw : `${raw}${shape[6] ? "" : ":00"}-05:00`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime()) ||
      (!hasZone && medellinIsoToLocal(date.toISOString()) !== raw.slice(0, 16))) {
    throw new Error("Invalid booking date and time.");
  }
  return date.toISOString();
}
