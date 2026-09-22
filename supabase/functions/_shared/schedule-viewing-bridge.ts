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

export function parsePreferredShowingAt(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(?:\.\d{1,3})?)?([zZ]|[+-]\d{2}:\d{2})?)?$/.test(
      trimmed,
    )
  ) {
    return null;
  }
  const withTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)
    ? trimmed
    : `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}-05:00`;
  const d = new Date(withTz);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
    return {
      ok: false,
      code: error.code === "P0001" ? "VALIDATION_ERROR" : "DB_ERROR",
      message: error.code === "P0001"
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
