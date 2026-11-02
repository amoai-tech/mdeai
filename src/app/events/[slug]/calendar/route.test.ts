import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ getPublicEventResult: vi.fn() }));
vi.mock("@/lib/events/get-public-event", () => ({
  getPublicEventResult: mock.getPublicEventResult,
}));
import { GET } from "./route";
import type { PublicEventDetail } from "@/lib/events/types";

const event: PublicEventDetail = {
  id: "a1b2c3d4-0001-0001-0001-000000000003",
  slug: "feria-de-las-flores",
  name: "Feria de las Flores",
  description: null,
  address: "Avenida El Poblado",
  city: "Medellín",
  startsAt: "2026-12-06T19:00:00+00:00",
  endsAt: "2026-12-06T23:00:00+00:00",
  imageUrl: null,
  currency: "COP",
  latitude: 6.21,
  longitude: -75.57,
  host: null,
  venue: null,
  tickets: [],
};

const context = { params: Promise.resolve({ slug: "feria-de-las-flores" }) };
const request = () => new Request("https://www.mdeai.co/events/feria-de-las-flores/calendar");

beforeEach(() => {
  mock.getPublicEventResult.mockReset();
});

describe("GET /events/[slug]/calendar", () => {
  it("serves an RFC 5545 file with the calendar media type and a safe filename", async () => {
    mock.getPublicEventResult.mockResolvedValue({ status: "ok", event });
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="mdeai-event-feria-de-las-flores.ics"',
    );

    const body = await response.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("DTSTART:20261206T190000Z\r\n");
    expect(body).toContain("DTEND:20261206T230000Z\r\n");
    expect(body).toContain("SUMMARY:Feria de las Flores\r\n");
    // The URL property uses the origin the visitor actually reached.
    expect(body).toContain("URL:https://www.mdeai.co/events/feria-de-las-flores\r\n");
    expect(body.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("returns 404 only when the event genuinely does not exist", async () => {
    mock.getPublicEventResult.mockResolvedValue({ status: "not-found" });
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
  });

  it("returns a retryable 503, not a 404, when the event read fails", async () => {
    mock.getPublicEventResult.mockResolvedValue({ status: "unavailable" });
    const response = await GET(request(), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("reports a stored start that cannot be turned into a calendar instead of guessing", async () => {
    mock.getPublicEventResult.mockResolvedValue({
      status: "ok",
      event: { ...event, startsAt: "not-a-date" },
    });
    const response = await GET(request(), context);
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
