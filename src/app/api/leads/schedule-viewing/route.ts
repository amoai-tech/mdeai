import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SCHEDULE_VIEWING_ACK_MESSAGE,
  SCHEDULE_VIEWING_ERROR_MESSAGES,
  scheduleViewingInputSchema,
  type ScheduleViewingErrorCode,
} from "@/lib/leads/schedule-viewing-schema";
import { resolvePreferredAtInstant } from "@/lib/leads/schedule-viewing-time";
import { createClient } from "@/lib/supabase/server";
import {
  getSupabaseAnonAuthHeaders,
  getSupabaseFunctionsBaseUrl,
} from "@/lib/supabase/edge-functions";

/**
 * Every failure a renter sees is worded here from shared safe copy — never from the
 * lead-capture edge function, which answers with raw Postgres/plpgsql prose
 * (`p1_schedule_tour_atomic: …`, unique-violation details). `message` is only passed for
 * this route's own zod issues, which are written for renters.
 */
function failure(
  code: ScheduleViewingErrorCode,
  status: number,
  message: string = SCHEDULE_VIEWING_ERROR_MESSAGES[code],
) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/** Upstream technical detail is diagnostic, so it goes to the server log, not the response. */
function logUpstreamFailure(
  outcome: string,
  detail: {
    status: number;
    code?: string;
    message?: string;
    listing?: { ref: string; shape: "uuid" | "slug" | "other"; length: number };
  },
) {
  console.error("[api/leads/schedule-viewing] upstream failure", { outcome, ...detail });
}

/**
 * Slug shape as `isSlugShape` and the RPC understand it: lowercase alphanumerics joined by
 * single hyphens. A character scan rather than a regex — the equivalent pattern
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$` is linear, but static analysis cannot tell that and flags it,
 * and a plain scan makes the absence of backtracking obvious.
 */
function isSlugShape(value: string): boolean {
  if (value.length === 0) return false;
  if (value.startsWith("-") || value.endsWith("-") || value.includes("--")) return false;
  for (const char of value) {
    const isLower = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    if (!isLower && !isDigit && char !== "-") return false;
  }
  return true;
}

/**
 * `LISTING_UNAVAILABLE` means the atomic RPC could not resolve the listing (it accepts a
 * UUID or an exact lowercase slug) or refused it as not requestable. Without the reference
 * that failed, the outcome is undiagnosable after the fact — the raw value never reaches the
 * renter's response. Log a short non-reversible fingerprint plus the identifier shape, which
 * is enough to correlate against the canonical apartment record without writing a
 * renter-visible slug into the logs.
 */
function describeListingRef(listingId: string): {
  ref: string;
  shape: "uuid" | "slug" | "other";
  length: number;
} {
  const value = listingId.trim();
  const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? "uuid"
    : isSlugShape(value)
      ? "slug"
      : "other";
  return {
    ref: createHash("sha256").update(value).digest("hex").slice(0, 12),
    shape,
    length: value.length,
  };
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
  const raw = JSON.stringify([
    input.listingId.trim(),
    input.email.trim().toLowerCase(),
    input.name.trim().toLowerCase(),
    input.phone?.trim() ?? "",
    input.tripId ?? "",
    input.preferredAtInstant,
  ]);
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `sv-${digest}`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failure("VALIDATION_ERROR", 400);
  }

  const parsed = scheduleViewingInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR" satisfies ScheduleViewingErrorCode,
          // Our own schema issues — already written in renter language above.
          message:
            parsed.error.issues[0]?.message ??
            SCHEDULE_VIEWING_ERROR_MESSAGES.VALIDATION_ERROR,
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
    return failure("VALIDATION_ERROR", 400);
  }

  // p1_schedule_tour_atomic matches a UUID case-insensitively but a slug exactly, and every
  // stored slug is lowercase. Normalising here means a differently-cased id still books, even
  // before the edge function's own normalisation is deployed.
  const listingId = data.listingId.trim().toLowerCase();

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
        listing_id: listingId,
        listing_title: data.listingTitle,
        preferred_at: preferredAtInstant,
        trip_id: data.tripId ?? null,
        idempotency_key: buildScheduleIdempotencyKey({
          listingId,
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
    error?: { code?: string; message?: string };
  };

  if (edgeRes.status === 429) {
    logUpstreamFailure("rate_limited", {
      status: edgeRes.status,
      code: edgeJson.error?.code,
      message: edgeJson.error?.message,
    });
    return failure("RATE_LIMITED", 429);
  }

  if (!edgeRes.ok && edgeJson.error?.code === "LISTING_UNAVAILABLE") {
    logUpstreamFailure("listing_unavailable", {
      status: edgeRes.status,
      code: edgeJson.error.code,
      message: edgeJson.error.message,
      // Correlate a future failure with the canonical apartment, without logging the slug.
      listing: describeListingRef(listingId),
    });
    // The apartment cannot take a request; the renter's own input is not the problem.
    return failure("LISTING_UNAVAILABLE", 409);
  }

  if (!edgeRes.ok && edgeJson.error?.code === "VALIDATION_ERROR") {
    logUpstreamFailure("validation_rejected", {
      status: edgeRes.status,
      code: edgeJson.error.code,
      message: edgeJson.error.message,
    });
    return failure(
      "VALIDATION_ERROR",
      edgeRes.status >= 400 && edgeRes.status < 500 ? edgeRes.status : 502,
    );
  }

  const leadId = edgeJson.data?.lead_id;
  const showingId = edgeJson.data?.showing_id;

  // SAN-1203 — a request counts only when BOTH records committed. A lead-only
  // response is a server failure, never a partial success.
  if (!edgeRes.ok || !edgeJson.success || !leadId || !showingId) {
    logUpstreamFailure(leadId && !showingId ? "showing_not_committed" : "upstream_error", {
      status: edgeRes.status,
      code: edgeJson.error?.code,
      message: edgeJson.error?.message,
    });
    if (leadId && !showingId) {
      return failure("SHOWING_NOT_COMMITTED", 502);
    }
    return failure("UPSTREAM_ERROR", edgeRes.status >= 400 ? edgeRes.status : 502);
  }

  return NextResponse.json({
    success: true,
    leadId,
    showingId,
    message: SCHEDULE_VIEWING_ACK_MESSAGE,
  });
}
