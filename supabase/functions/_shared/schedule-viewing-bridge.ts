import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ScheduleViewingPayload = {
  listingId: string;
  preferredAt: string;
  tripId?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type ScheduleViewingResult = {
  leadId: string;
  showingId: string;
  idempotentReplay: boolean;
};

type AtomicScheduleRpcResult = {
  lead?: { id?: unknown };
  showing?: { id?: unknown };
  idempotent_replay?: unknown;
};

const MAX_PREFERRED_AT_LENGTH = 29;

function isAsciiDigits(value: string, start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

function hasValidDateTimeShape(value: string): boolean {
  if (
    value.length < 16 ||
    value[4] !== "-" ||
    value[7] !== "-" ||
    value[10] !== "T" ||
    value[13] !== ":" ||
    !isAsciiDigits(value, 0, 4) ||
    !isAsciiDigits(value, 5, 7) ||
    !isAsciiDigits(value, 8, 10) ||
    !isAsciiDigits(value, 11, 13) ||
    !isAsciiDigits(value, 14, 16)
  ) {
    return false;
  }

  if (value.length === 16) return true;
  if (value.length < 19 || value[16] !== ":" || !isAsciiDigits(value, 17, 19)) {
    return false;
  }
  if (value.length === 19) return true;
  return (
    value.length >= 21 &&
    value.length <= 23 &&
    value[19] === "." &&
    isAsciiDigits(value, 20, value.length)
  );
}

export function parsePreferredShowingAt(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_PREFERRED_AT_LENGTH) return null;

  let dateTime = trimmed;
  let hasTimezone = false;
  if (trimmed.endsWith("Z") || trimmed.endsWith("z")) {
    dateTime = trimmed.slice(0, -1);
    hasTimezone = true;
  } else if (
    trimmed.length >= 22 &&
    (trimmed[trimmed.length - 6] === "+" || trimmed[trimmed.length - 6] === "-") &&
    trimmed[trimmed.length - 3] === ":" &&
    isAsciiDigits(trimmed, trimmed.length - 5, trimmed.length - 3) &&
    isAsciiDigits(trimmed, trimmed.length - 2, trimmed.length)
  ) {
    dateTime = trimmed.slice(0, -6);
    hasTimezone = true;
  }

  if (!hasValidDateTimeShape(dateTime)) return null;

  const withTimezone = hasTimezone
    ? trimmed
    : `${dateTime.length === 16 ? `${dateTime}:00` : dateTime}-05:00`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function createScheduleViewingBridge(
  client: SupabaseClient,
  payload: ScheduleViewingPayload,
): Promise<
  | { ok: true; result: ScheduleViewingResult }
  | { ok: false; code: string; message: string }
> {
  const scheduledAt = parsePreferredShowingAt(payload.preferredAt);
  if (!scheduledAt) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "preferred_at must be a valid datetime",
    };
  }

  const idempotencyKey = payload.idempotencyKey?.trim() ?? "";
  if (idempotencyKey.length < 8) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "idempotency_key is required",
    };
  }

  const { data, error } = await client.rpc("p1_schedule_tour_atomic", {
    p_listing_id: payload.listingId,
    p_user_id: payload.userId ?? null,
    p_idempotency_key: idempotencyKey,
    p_source: payload.source ?? "form",
    p_email: payload.email ?? null,
    p_name: payload.name ?? null,
    p_phone: payload.phone ?? null,
    p_trip_id: payload.tripId ?? null,
    p_scheduled_at: scheduledAt,
    p_lead_metadata: payload.metadata ?? {},
    p_showing_metadata: {
      source: "chat-lead-capture",
      listing_id: payload.listingId,
    },
  });

  if (error) {
    console.error("[schedule-viewing-bridge] atomic RPC:", error);
    const isValidationError =
      error.code === "P0001" &&
      error.message.startsWith("p1_schedule_tour_atomic:");
    return {
      ok: false,
      code: isValidationError ? "VALIDATION_ERROR" : "DB_ERROR",
      message: isValidationError
        ? error.message
        : "Failed to save viewing request",
    };
  }

  const rpcResult = data as AtomicScheduleRpcResult | null;
  const leadId = rpcResult?.lead?.id;
  const showingId = rpcResult?.showing?.id;
  if (typeof leadId !== "string" || typeof showingId !== "string") {
    return {
      ok: false,
      code: "DB_ERROR",
      message: "Viewing request did not return committed records",
    };
  }

  return {
    ok: true,
    result: {
      leadId,
      showingId,
      idempotentReplay: rpcResult?.idempotent_replay === true,
    },
  };
}

export function isScheduleViewingRequest(
  intent: string,
  listingId: unknown,
  preferredAt: unknown,
): listingId is string {
  return (
    intent === "rental" &&
    typeof listingId === "string" &&
    listingId.trim().length > 0 &&
    typeof preferredAt === "string" &&
    preferredAt.trim().length > 0
  );
}
