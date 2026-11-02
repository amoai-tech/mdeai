import { getPublicEventResult } from "@/lib/events/get-public-event";
import {
  CALENDAR_CONTENT_TYPE,
  buildEventCalendar,
} from "@/lib/events/event-calendar";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * `/events/<slug-or-id>/calendar` — download the saved schedule as an RFC 5545 calendar file.
 *
 * Same visibility rules as the public event page: only published/live, active events resolve.
 * A temporary read failure is a retryable 503, never a false 404.
 */
export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const result = await getPublicEventResult(slug);

  if (result.status === "unavailable") {
    return Response.json(
      { error: "Event temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
  if (result.status === "not-found") {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  const calendar = buildEventCalendar(result.event, {
    // The origin the visitor actually reached, so the URL property opens the page they are on.
    siteOrigin: new URL(request.url).origin,
  });
  // Only a stored start time that cannot be parsed lands here; a calendar with a guessed
  // start would be a fabricated fact.
  if (!calendar) {
    return Response.json({ error: "Event calendar unavailable" }, { status: 500 });
  }

  return new Response(calendar.body, {
    status: 200,
    headers: {
      "Content-Type": CALENDAR_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${calendar.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
