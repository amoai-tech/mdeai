import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

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
 *  3. the server-only atomic RPC checks token/event binding before consumption;
 *  4. the existing race-safe consumer can accept a paid ticket only once;
 *  5. acceptance and audit (actor, device and outcome) share one DB transaction.
 *
 * The route never reports success unless the RPC returned `consumed`.
 */
export async function POST(request: Request) {
  try {
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

  // The wrapper reuses the existing consume + audit RPCs within one DB
  // transaction. If the audit insert fails, the consume update rolls back.
  const device = request.headers.get("user-agent")?.slice(0, 200) ?? null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip");
  // Never allow an invalid forwarded value to fail the INET audit insert.
  const ip = forwarded && isIP(forwarded) ? forwarded : null;

  let outcome: { result?: string; details?: Record<string, unknown> };
  try {
    const { data, error } = await service.rpc("ticket_validate_consume_audited", {
      p_event_id: eventId,
      p_qr_token: token,
      p_scanned_by: user.id,
      p_scanner_device: device,
      p_ip_address: ip,
    });
    if (error) {
      console.error("[tickets/validate] atomic scan failed:", error.message);
      return NextResponse.json({ ok: false, code: "CONSUME_FAILED" }, { status: 500 });
    }
    outcome = (data ?? {}) as { result?: string; details?: Record<string, unknown> };
  } catch (error) {
    console.error("[tickets/validate] atomic scan threw:", error);
    return NextResponse.json({ ok: false, code: "CONSUME_FAILED" }, { status: 500 });
  }

  if (outcome.result === "unknown_token") {
    return NextResponse.json(
      { ok: false, code: "UNKNOWN_TICKET", message: "This QR is not a ticket." },
      { status: 404 },
    );
  }
  if (outcome.result === "wrong_event") {
    return NextResponse.json(
      { ok: false, code: "WRONG_EVENT", message: "This ticket belongs to another event." },
      { status: 409 },
    );
  }
  const result = outcome.result;
  if (!result) {
    return NextResponse.json({ ok: false, code: "CONSUME_FAILED" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: result === "consumed",
      result,
      details: outcome.details ?? {},
    },
    { status: result === "consumed" ? 200 : 409 },
  );
  } catch (error) {
    // A rejected auth/network call should always return a structured API
    // failure, never an uncaught Next.js error page to the scanner.
    console.error("[tickets/validate] unhandled scan error:", error);
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
