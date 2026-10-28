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
