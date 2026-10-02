import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isFutureInstant, resolvePreferredAtInstant } from "@/lib/leads/schedule-viewing-time";
import { brokerViewingActionRequestSchema } from "@/lib/rentals/broker-viewing-action-schema";
import { runBrokerViewingAction } from "@/lib/rentals/run-broker-viewing-action";

/**
 * SAN-1206 · PATCH /api/host/rentals/viewings/[id]
 *
 * The broker confirms, declines or reschedules one viewing request. This handler is a public
 * API surface, so it authorizes on the server and treats the body as untrusted — but it is not
 * the authority: the database RPC re-checks ownership on the locked row and refuses a stale
 * expectation. Hiding a button is not security, and neither is this route.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid showing id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = brokerViewingActionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid viewing action" }, { status: 400 });
  }

  const { action, expectedStatus, expectedScheduledAt, newWallClock } = parsed.data;

  let newScheduledAt: string | null = null;
  if (action === "reschedule") {
    if (!newWallClock) {
      return NextResponse.json(
        { error: "A reschedule needs a new viewing time" },
        { status: 400 },
      );
    }

    // The browser sent a `datetime-local` wall clock with no offset. It is resolved in
    // listing-local time here, on the server, so neither the browser's timezone nor the Vercel
    // process timezone can change which instant the broker meant.
    const instant = resolvePreferredAtInstant(newWallClock);
    if (!instant) {
      return NextResponse.json({ error: "Invalid viewing time" }, { status: 400 });
    }
    if (!isFutureInstant(instant)) {
      return NextResponse.json(
        { error: "The new viewing time must be in the future" },
        { status: 400 },
      );
    }
    newScheduledAt = instant;
  }

  const result = await runBrokerViewingAction(supabase, {
    showingId: id,
    action,
    expectedStatus,
    expectedScheduledAt,
    newScheduledAt,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ showing: result.showing });
}
