import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SCHEDULE_VIEWING_ACK_MESSAGE,
  scheduleViewingInputSchema,
  type ScheduleViewingErrorCode,
} from "@/lib/leads/schedule-viewing-schema";
import { resolvePreferredAtInstant } from "@/lib/leads/schedule-viewing-time";
import { createClient } from "@/lib/supabase/server";
import {
  getSupabaseAnonAuthHeaders,
  getSupabaseFunctionsBaseUrl,
} from "@/lib/supabase/edge-functions";

function failure(code: ScheduleViewingErrorCode, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/**
 * SAN-1203 — hash the canonical instant, not the raw wall clock, so equivalent
 * submissions (`15:00` vs `15:00:00`) collapse onto the same idempotency key.
 */
function buildScheduleIdempotencyKey(input: {
  listingId: string;
  email: string;
  name: string;
  phone?: string;
  tripId?: string;
  preferredAtInstant: string;
}): string {
  const raw = [
    input.listingId,
    input.email.toLowerCase(),
    input.name.trim().toLowerCase(),
    input.phone?.trim() ?? "",
    input.tripId ?? "",
    input.preferredAtInstant,
  ].join("|");
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `sv-${digest}`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failure("VALIDATION_ERROR", "Invalid JSON", 400);
  }

  const parsed = scheduleViewingInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR" satisfies ScheduleViewingErrorCode,
          message: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // The schema already proved this resolves; re-resolve here so the value sent
  // downstream is the canonical UTC instant rather than a browser wall clock.
  const preferredAtInstant = resolvePreferredAtInstant(data.preferredAt);
  if (!preferredAtInstant) {
    return failure(
      "VALIDATION_ERROR",
      "preferredAt must be a valid Medellín-local date and time",
      400,
    );
  }

  const supabase = await createClient();
  // Guest lead capture: no 401 when logged out — edge receives anon JWT (AUTH-004).
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const edgeRes = await fetch(
    `${getSupabaseFunctionsBaseUrl()}/chat-lead-capture`,
    {
      method: "POST",
      headers: getSupabaseAnonAuthHeaders(session?.access_token),
      body: JSON.stringify({
        intent: "rental",
        source: "form",
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        neighborhood: data.neighborhood,
        listing_id: data.listingId,
        listing_title: data.listingTitle,
        preferred_at: preferredAtInstant,
        trip_id: data.tripId ?? null,
        idempotency_key: buildScheduleIdempotencyKey({
          listingId: data.listingId,
          email: data.email,
          name: data.name,
          phone: data.phone,
          tripId: data.tripId,
          preferredAtInstant,
        }),
      }),
    },
  );

  const edgeJson = (await edgeRes.json().catch(() => ({}))) as {
    success?: boolean;
    data?: {
      lead_id?: string;
      showing_id?: string;
      actions?: Array<{ payload?: { message?: string } }>;
    };
    error?: { message?: string };
  };

  if (edgeRes.status === 429) {
    return failure(
      "RATE_LIMITED",
      edgeJson.error?.message ?? "Too many submissions — try again later",
      429,
    );
  }

  const leadId = edgeJson.data?.lead_id;
  const showingId = edgeJson.data?.showing_id;

  // SAN-1203 — a request counts only when BOTH records committed. A lead-only
  // response is a server failure, never a partial success.
  if (!edgeRes.ok || !edgeJson.success || !leadId || !showingId) {
    if (leadId && !showingId) {
      return failure(
        "SHOWING_NOT_COMMITTED",
        "The viewing was not committed — please try again.",
        502,
      );
    }
    return failure(
      "UPSTREAM_ERROR",
      edgeJson.error?.message ?? "Lead capture failed",
      edgeRes.status >= 400 ? edgeRes.status : 502,
    );
  }

  return NextResponse.json({
    success: true,
    leadId,
    showingId,
    message: SCHEDULE_VIEWING_ACK_MESSAGE,
  });
}
