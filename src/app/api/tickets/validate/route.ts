import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  eventId: z.string().uuid(),
  token: z.string().min(1).max(2000),
});

/**
 * SAN-984 — authorized ticket check-in.
 *
 * Authority order:
 *  1. the caller must be signed in;
 *  2. the caller must own the event (organizer) or be a site admin;
 *  3. the token must belong to *that* event (wrong-event is rejected before any
 *     consume attempt, so a valid ticket for another show is never "used");
 *  4. consumption is the existing atomic `ticket_validate_consume` RPC, which
 *     can only flip an unused ticket once;
 *  5. the result is recorded with the real staff actor and scanner metadata.
 *
 * The route never reports success unless the RPC returned `consumed`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, code: "AUTH_REQUIRED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
  const { eventId, token } = parsed.data;

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, name")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return NextResponse.json({ ok: false, code: "EVENT_LOOKUP_FAILED" }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  }

  const isOwner = (event as { organizer_id: string | null }).organizer_id === user.id;
  if (!isOwner) {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) {
      return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
    }
  }

  const service = createServiceRoleClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, code: "SERVICE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const scannerUserId = user.id;
  const privilegedClient = service;

  // Existing event_check_ins permits a null attendee_id for rejected unknown
  // scans. Persist the actual scanner, event and result without linking a
  // foreign attendee to the host's event or inventing a matching identity.
  const device = request.headers.get("user-agent")?.slice(0, 200) ?? null;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  async function recordOutcome(
    attendeeId: string | null,
    result: string,
    details: Record<string, unknown> = {},
  ) {
    const auditArgs = {
      p_event_id: eventId,
      p_attendee_id: attendeeId,
      p_qr_token: token,
      p_scanned_by: scannerUserId,
      p_result: result,
      p_details: details as Json,
      ...(device ? { p_scanner_device: device } : {}),
      ...(ip ? { p_ip_address: ip } : {}),
    };
    const { error } = await privilegedClient.rpc("record_check_in", auditArgs as never);
    if (error) console.error("[tickets/validate] record_check_in failed:", error.message);
  }

  const { data: attendee, error: attendeeError } = await service
    .from("event_attendees")
    .select("id, event_id, status, qr_used_at, full_name")
    .eq("qr_token", token)
    .maybeSingle();

  if (attendeeError) {
    return NextResponse.json({ ok: false, code: "TOKEN_LOOKUP_FAILED" }, { status: 500 });
  }
  if (!attendee) {
    await recordOutcome(null, "unknown_token");
    return NextResponse.json(
      { ok: false, code: "UNKNOWN_TICKET", message: "This QR is not a ticket." },
      { status: 404 },
    );
  }
  if ((attendee as { event_id: string }).event_id !== eventId) {
    await recordOutcome(null, "wrong_event");
    return NextResponse.json(
      { ok: false, code: "WRONG_EVENT", message: "This ticket belongs to another event." },
      { status: 409 },
    );
  }

  const { data: consumed, error: consumeError } = await service.rpc(
    "ticket_validate_consume",
    { p_qr_token: token },
  );

  if (consumeError) {
    console.error("[tickets/validate] consume failed:", consumeError.message);
    return NextResponse.json({ ok: false, code: "CONSUME_FAILED" }, { status: 500 });
  }

  const outcome = (consumed ?? {}) as {
    result?: string;
    details?: Record<string, unknown>;
  };
  const result = outcome.result ?? "unknown_token";

  await recordOutcome((attendee as { id: string }).id, result, outcome.details ?? {});

  return NextResponse.json(
    {
      ok: result === "consumed",
      result,
      attendeeName: (attendee as { full_name: string | null }).full_name,
      details: outcome.details ?? {},
    },
    { status: result === "consumed" ? 200 : 409 },
  );
}
