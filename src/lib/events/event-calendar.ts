/**
 * RFC 5545 (.ics) calendar export for a saved public event.
 *
 * Truthfulness rules for this file:
 * - DTSTART/DTEND come from the stored `event_start_time` / `event_end_time`, converted to UTC.
 * - The event name becomes SUMMARY; nothing is renamed or embellished.
 * - LOCATION is emitted only when the event has a saved venue name or street address.
 * - A missing/invalid end time omits DTEND/DURATION, as RFC 5545 permits.
 *   No organizer-confirmed duration is inferred.
 * - The file never claims attendance, a booking, or a confirmed organizer.
 */

export type CalendarEventSource = {
  id: string;
  slug: string | null;
  name: string;
  startsAt: string;
  endsAt: string | null;
  address: string | null;
  city: string | null;
  venue: { name: string; address: string | null; city: string | null } | null;
};

export type EventCalendarFile = {
  filename: string;
  body: string;
};

/** Download response content type — RFC 5545 §8.1 media type plus the charset the file uses. */
export const CALENDAR_CONTENT_TYPE = "text/calendar; charset=utf-8";

export type BuildEventCalendarOptions = {
  /** Absolute site origin (e.g. "https://www.mdeai.co") used to make URL absolute. */
  siteOrigin?: string | null;
  /** Injection point for DTSTAMP so tests are deterministic. Defaults to the current time. */
  now?: Date;
};

/** RFC 5545 §3.1: physical lines are capped at 75 octets, excluding the CRLF. */
const MAX_LINE_OCTETS = 75;

const UNKNOWN_END_COMMENT = "No confirmed end time is available for this event.";

const encoder = new TextEncoder();

/** UTF-8 octet length of a string — RFC 5545 limits physical lines by octets, not characters. */
function octetCount(value: string): number {
  return encoder.encode(value).length;
}

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, and newlines. */
export function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a logical content line into physical lines of at most 75 octets (RFC 5545 §3.1).
 * Folding happens on character boundaries so a multi-byte UTF-8 sequence is never split;
 * continuation lines carry the single leading space that eats one of their 75 octets.
 */
export function foldCalendarLine(line: string): string {
  const physical: string[] = [];
  let current = "";
  let currentOctets = 0;

  for (const char of line) {
    const size = octetCount(char);
    const limit = physical.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (currentOctets + size > limit) {
      physical.push(current);
      current = "";
      currentOctets = 0;
    }
    current += char;
    currentOctets += size;
  }

  physical.push(current);
  return physical.join("\r\n ");
}

/** RFC 5545 §3.3.5 DATE-TIME in UTC form: YYYYMMDDThhmmssZ. */
export function formatCalendarUtc(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * A download filename that is safe for Content-Disposition: ASCII letters, digits and dashes
 * only. Derived from the public slug (preferred) or the event id so it is stable across visits.
 */
export function eventCalendarFilename(event: Pick<CalendarEventSource, "id" | "slug">): string {
  const slug = (event.slug ?? "").normalize("NFKD").toLowerCase();
  const safe = slug
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  // The event id is a UUID, so the fallback is already filename-safe.
  return `mdeai-event-${safe || event.id}.ics`;
}

/** Canonical public path for an event: `/events/<slug-or-id>` (mirrors generateMetadata). */
export function eventCanonicalPath(event: Pick<CalendarEventSource, "id" | "slug">): string {
  return `/events/${event.slug ?? event.id}`;
}

/** Download path served by `src/app/events/[slug]/calendar/route.ts`. */
export function eventCalendarPath(event: Pick<CalendarEventSource, "id" | "slug">): string {
  return `${eventCanonicalPath(event)}/calendar`;
}

/**
 * LOCATION made only from saved parts. The venue row wins over the event row (it is the
 * fresher record), and a city already contained in the street address is not repeated.
 * Returns null when nothing has been saved — an empty LOCATION must not be emitted.
 */
export function eventCalendarLocation(event: CalendarEventSource): string | null {
  const venue = event.venue;
  const name = venue?.name?.trim() || null;
  const street = (venue?.address ?? event.address)?.trim() || null;
  const city = (venue?.city ?? event.city)?.trim() || null;
  const cityIsInStreet =
    street !== null && city !== null && street.toLowerCase().includes(city.toLowerCase());
  const parts = [name, street, cityIsInStreet ? null : city].filter(
    (part): part is string => Boolean(part),
  );
  // A city alone is an area, not an event meeting location.
  return name || street ? parts.join(", ") : null;
}

function absoluteSiteOrigin(siteOrigin: string | null | undefined): string | null {
  if (!siteOrigin) return null;
  try {
    const origin = new URL(siteOrigin);
    if (origin.protocol !== "https:" && origin.protocol !== "http:") return null;
    return origin.origin;
  } catch {
    return null;
  }
}

function parseStoredDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Build the calendar file for a public event.
 *
 * Returns null only when the stored start time cannot be parsed: a calendar with a guessed
 * start would be a fabricated fact, so the caller must report the failure instead.
 */
export function buildEventCalendar(
  event: CalendarEventSource,
  options: BuildEventCalendarOptions = {},
): EventCalendarFile | null {
  const start = parseStoredDate(event.startsAt);
  if (!start) return null;

  const storedEnd = parseStoredDate(event.endsAt);
  // RFC 5545 permits a VEVENT without DTEND; do not fabricate an end time.
  const endIsUsable = storedEnd !== null && storedEnd.getTime() > start.getTime();

  const now = options.now ?? new Date();
  const origin = absoluteSiteOrigin(options.siteOrigin);
  const url = origin ? new URL(eventCanonicalPath(event), origin).toString() : null;
  const location = eventCalendarLocation(event);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MDE AI//Public event calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable per event: one event id always produces one calendar entry, so an imported
    // event is updated in place instead of duplicated on a second download.
    `UID:${event.id}@mdeai.co`,
    `DTSTAMP:${formatCalendarUtc(now)}`,
    `DTSTART:${formatCalendarUtc(start)}`,
    `SUMMARY:${escapeCalendarText(event.name)}`,
  ];

  if (endIsUsable && storedEnd) lines.push(`DTEND:${formatCalendarUtc(storedEnd)}`);
  else lines.push(`COMMENT:${escapeCalendarText(UNKNOWN_END_COMMENT)}`);
  if (location) lines.push(`LOCATION:${escapeCalendarText(location)}`);
  if (url) lines.push(`URL:${url}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  return {
    filename: eventCalendarFilename(event),
    body: `${lines.map(foldCalendarLine).join("\r\n")}\r\n`,
  };
}
