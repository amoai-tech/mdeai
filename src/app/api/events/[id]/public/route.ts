import { NextResponse } from "next/server";
import { getPublicEventResult } from "@/lib/events/get-public-event";

type RouteContext = { params: Promise<{ id: string }> };

/** Public event detail for chat sheet checkout — same shape as /events/[slug] page. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await getPublicEventResult(id);
  // A failed read is retryable and must not read as "this event does not exist".
  if (result.status === "unavailable") {
    return NextResponse.json(
      { error: "Event temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
  if (result.status === "not-found") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ event: result.event });
}
