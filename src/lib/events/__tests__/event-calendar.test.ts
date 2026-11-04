import { describe, expect, it } from "vitest";
import type { BuildEventCalendarOptions } from "../event-calendar";
import {
  buildEventCalendar,
  escapeCalendarText,
  eventCalendarFilename,
  eventCalendarLocation,
  eventCalendarPath,
  foldCalendarLine,
  formatCalendarUtc,
  type CalendarEventSource,
} from "../event-calendar";

const NOW = new Date("2026-08-01T12:00:00.000Z");

function event(overrides: Partial<CalendarEventSource> = {}): CalendarEventSource {
  return {
    id: "a1b2c3d4-0001-0001-0001-000000000003",
    slug: "feria-de-las-flores",
    name: "Feria de las Flores",
    startsAt: "2026-12-06T19:00:00+00:00",
    endsAt: "2026-12-06T23:00:00+00:00",
    address: "Avenida El Poblado",
    city: "Medellín",
    venue: null,
    ...overrides,
  };
}

/** Build a calendar that must exist; a null here is a broken fixture, not an expected value. */
function makeCalendar(event: CalendarEventSource, options?: BuildEventCalendarOptions) {
  const built = buildEventCalendar(event, options);
  if (!built) throw new Error("expected a calendar file for this event");
  return built;
}

function unfold(body: string): string {
  return body.replace(/\r\n[ \t]/g, "");
}

function lines(body: string): string[] {
  return unfold(body).split("\r\n").filter((line) => line.length > 0);
}

function octets(line: string): number {
  return new TextEncoder().encode(line).length;
}

describe("escapeCalendarText", () => {
  it("escapes commas, semicolons, backslashes and newlines per RFC 5545", () => {
    expect(escapeCalendarText("A, B; C\\D")).toBe("A\\, B\\; C\\\\D");
    expect(escapeCalendarText("line1\nline2\r\nline3")).toBe("line1\\nline2\\nline3");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeCalendarText("Feria de las Flores 2026")).toBe("Feria de las Flores 2026");
  });
});

describe("formatCalendarUtc", () => {
  it("renders a stored +00:00 timestamp as a UTC DATE-TIME", () => {
    expect(formatCalendarUtc(new Date("2026-12-06T19:00:00+00:00"))).toBe("20261206T190000Z");
  });

  it("converts a non-UTC stored offset to UTC instead of keeping wall-clock time", () => {
    // 14:00 in Medellín (UTC-5) is 19:00 UTC.
    expect(formatCalendarUtc(new Date("2026-12-06T14:00:00-05:00"))).toBe("20261206T190000Z");
  });
});

describe("foldCalendarLine", () => {
  it("keeps short lines on one physical line", () => {
    expect(foldCalendarLine("SUMMARY:Corto")).toBe("SUMMARY:Corto");
  });

  it("folds long lines to at most 75 octets per physical line", () => {
    const folded = foldCalendarLine(`SUMMARY:${"a".repeat(200)}`);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const line of physical) expect(octets(line)).toBeLessThanOrEqual(75);
    // Unfolding restores the original logical line.
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"a".repeat(200)}`);
  });

  it("never splits a multi-byte character across lines", () => {
    const value = `SUMMARY:${"é".repeat(120)}`;
    const folded = foldCalendarLine(value);
    for (const line of folded.split("\r\n")) {
      expect(octets(line)).toBeLessThanOrEqual(75);
      // A replacement character would mean a UTF-8 sequence was cut in half.
      expect(line).not.toContain("\uFFFD");
    }
    expect(folded.replace(/\r\n /g, "")).toBe(value);
  });
});

describe("eventCalendarFilename", () => {
  it("uses the public slug and stays ASCII-safe for Content-Disposition", () => {
    expect(eventCalendarFilename({ id: "abc", slug: "feria-de-las-flores" })).toBe(
      "mdeai-event-feria-de-las-flores.ics",
    );
  });

  it("falls back to the event id when there is no slug", () => {
    expect(
      eventCalendarFilename({ id: "a1b2c3d4-0001-0001-0001-000000000003", slug: null }),
    ).toBe("mdeai-event-a1b2c3d4-0001-0001-0001-000000000003.ics");
  });

  it("strips characters that would break or forge the header", () => {
    const filename = eventCalendarFilename({ id: "x", slug: 'a"b\\c\r\n/injection' });
    expect(filename).toBe("mdeai-event-a-b-c-injection.ics");
    expect(filename).not.toMatch(/["\\\r\n/]/);
  });
});

describe("eventCalendarPath", () => {
  it("prefers the slug and falls back to the id", () => {
    expect(eventCalendarPath({ id: "abc", slug: "feria" })).toBe("/events/feria/calendar");
    expect(eventCalendarPath({ id: "abc", slug: null })).toBe("/events/abc/calendar");
  });
});

describe("eventCalendarLocation", () => {
  it("is null when nothing addressable was saved", () => {
    expect(
      eventCalendarLocation(event({ address: null, city: null, venue: null })),
    ).toBeNull();
  });

  it("never labels a city alone as the event meeting location", () => {
    expect(eventCalendarLocation(event({ address: null, venue: null, city: "Medellín" }))).toBeNull();
    const calendar = makeCalendar(event({ address: null, venue: null, city: "Medellín" }), { now: NOW });
    expect(unfold(calendar.body)).not.toContain("LOCATION:");
  });

  it("uses the saved venue and does not repeat a city already in the street", () => {
    expect(
      eventCalendarLocation(
        event({
          address: null,
          city: null,
          venue: { name: "Plaza Mayor", address: "Calle 41 #55-80, Medellín", city: "Medellín" },
        }),
      ),
    ).toBe("Plaza Mayor, Calle 41 #55-80, Medellín");
  });

  it("uses the event address when no venue row is stored", () => {
    expect(eventCalendarLocation(event())).toBe("Avenida El Poblado, Medellín");
  });
});

describe("buildEventCalendar", () => {
  it("writes a UTC VEVENT with the stored window, a stable UID and the canonical URL", () => {
    const calendar = makeCalendar(event(), {
      siteOrigin: "https://www.mdeai.co",
      now: NOW,
    });
    const body = unfold(calendar.body);

    expect(body).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(body).toContain("UID:a1b2c3d4-0001-0001-0001-000000000003@mdeai.co\r\n");
    expect(body).toContain("DTSTAMP:20260801T120000Z\r\n");
    expect(body).toContain("DTSTART:20261206T190000Z\r\n");
    expect(body).toContain("DTEND:20261206T230000Z\r\n");
    expect(body).toContain("SUMMARY:Feria de las Flores\r\n");
    expect(body).toContain("LOCATION:Avenida El Poblado\\, Medellín\r\n");
    expect(body).toContain("URL:https://www.mdeai.co/events/feria-de-las-flores\r\n");
    // No invented claims about attendance, booking or organizer.
    expect(body).not.toMatch(/ATTENDEE|ORGANIZER|BOOKING|CONFIRMED/i);
    expect(calendar.filename).toBe("mdeai-event-feria-de-las-flores.ics");
  });

  it("keeps one UID per event id so a re-import updates instead of duplicating", () => {
    const first = makeCalendar(event(), { now: NOW }).body;
    const second = makeCalendar(
      event({ name: "Feria de las Flores (renamed)", startsAt: "2026-12-07T19:00:00+00:00" }),
      { now: NOW },
    ).body;
    const uid = (body: string) => body.match(/UID:(.*)\r\n/)?.[1];
    expect(uid(first)).toBe(uid(second));
  });

  it("omits LOCATION when no address or venue was saved", () => {
    const calendar = makeCalendar(
      event({ address: null, city: null, venue: null }),
      { now: NOW },
    );
    expect(unfold(calendar.body)).not.toContain("LOCATION:");
  });

  it("omits URL when no site origin is known instead of emitting a broken one", () => {
    const calendar = makeCalendar(event(), { now: NOW });
    expect(unfold(calendar.body)).not.toContain("URL:");
  });

  it("escapes the stored name so commas and newlines stay inside SUMMARY", () => {
    const calendar = makeCalendar(
      event({ name: "Noche, música; y más\nSegunda línea" }),
      { now: NOW },
    );
    const body = unfold(calendar.body);
    expect(body).toContain("SUMMARY:Noche\\, música\\; y más\\nSegunda línea\r\n");
    // The newline must not become a real calendar line boundary.
    expect(body).not.toContain("\r\nSegunda línea");
  });

  it("omits an unknown end time instead of reserving a made-up two-hour block", () => {
    const calendar = makeCalendar(event({ endsAt: null }), { now: NOW });
    const body = unfold(calendar.body);
    expect(body).toContain("DTSTART:20261206T190000Z\r\n");
    expect(body).not.toContain("DTEND:");
    expect(body).not.toContain("DURATION:");
    expect(body).toContain("COMMENT:No confirmed end time is available for this event.");
  });

  it("omits an invalid or backwards end time, rather than silently replacing it", () => {
    for (const endsAt of ["bad-time", "2026-12-06T18:00:00+00:00"]) {
      const body = unfold(makeCalendar(event({ endsAt }), { now: NOW }).body);
      expect(body).not.toContain("DTEND:");
      expect(body).not.toContain("DURATION:");
      expect(body).toContain("COMMENT:No confirmed end time");
    }
  });

  it("refuses to guess a start time that cannot be parsed", () => {
    expect(buildEventCalendar(event({ startsAt: "not-a-date" }), { now: NOW })).toBeNull();
  });

  it("uses CRLF line endings and folds every physical line to 75 octets or fewer", () => {
    const calendar = makeCalendar(
      event({
        name: "Festival Internacional de Música y Cultura de Medellín ".repeat(3),
        venue: {
          name: "Parque de los Deseos",
          address: "Carrera 52 #71-117, Barrio Sevilla, Medellín, Antioquia",
          city: "Medellín",
        },
      }),
      { siteOrigin: "https://www.mdeai.co", now: NOW },
    );
    const physical = calendar.body.split("\r\n");
    for (const line of physical) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(calendar.body.endsWith("\r\n")).toBe(true);
    expect(lines(calendar.body)[0]).toBe("BEGIN:VCALENDAR");
    expect(lines(calendar.body).at(-1)).toBe("END:VCALENDAR");
  });

  it("ignores an unusable site origin rather than writing a bad URL", () => {
    const calendar = makeCalendar(event(), {
      siteOrigin: "ht!tp://not a url",
      now: NOW,
    });
    expect(unfold(calendar.body)).not.toContain("URL:");
  });
});
