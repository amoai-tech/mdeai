import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BrokerViewingAction } from "./broker-viewing-action";

type DbClient = SupabaseClient<Database>;

/** The canonical row the RPC returns after a successful (or replayed) transition. */
export type BrokerViewingActionOutcome = {
  showingId: string;
  status: string;
  scheduledAt: string;
  updatedAt: string;
};

export type RunBrokerViewingActionResult =
  | { ok: true; showing: BrokerViewingActionOutcome }
  | { ok: false; message: string; status: 400 | 403 | 404 | 409 | 500 };

export type BrokerViewingActionParams = {
  showingId: string;
  action: BrokerViewingAction;
  expectedStatus: string;
  expectedScheduledAt: string;
  /** Canonical UTC instant, only for `reschedule`; the route resolves it from the wall clock. */
  newScheduledAt: string | null;
};

/**
 * Map the database error contract onto HTTP statuses.
 *
 * The codes are raised deliberately by p1_broker_update_showing, so this mapping is a contract
 * rather than a guess:
 *   42501 authentication/authorization refused
 *   P0002 showing not found
 *   22023 malformed or non-future reschedule input
 *   P1206 stale expected state, or a transition the current state does not permit
 *
 * The message fallbacks exist so a future change that loses the code still lands on a sane
 * status instead of leaking a 500 for what is really a conflict.
 */
function viewingActionFailure(
  message: string,
  code?: string,
): Extract<RunBrokerViewingActionResult, { ok: false }> {
  if (code === "P1206" || /showing changed since it was loaded|cannot be|already occupies that day/i.test(message)) {
    return { ok: false, message, status: 409 };
  }
  if (code === "42501" || /authentication required|does not own this showing/i.test(message)) {
    return { ok: false, message, status: 403 };
  }
  if (code === "P0002" || /showing not found/i.test(message)) {
    return { ok: false, message, status: 404 };
  }
  if (code === "22023" || /reschedule (requires|time must)/i.test(message)) {
    return { ok: false, message, status: 400 };
  }
  return { ok: false, message, status: 500 };
}

/**
 * Narrow the RPC's jsonb payload.
 *
 * Supabase types the return as `Json`, so this is the boundary where an unexpected shape has to
 * become an explicit failure rather than a `undefined` that renders as a blank card.
 */
export function parseBrokerViewingOutcome(
  data: unknown,
): BrokerViewingActionOutcome | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const row = data as Record<string, unknown>;
  const { id, status, scheduled_at: scheduledAt, updated_at: updatedAt } = row;

  if (
    typeof id !== "string" ||
    typeof status !== "string" ||
    typeof scheduledAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  return { showingId: id, status, scheduledAt, updatedAt };
}

/**
 * Perform one broker viewing transition through the canonical RPC.
 *
 * This never touches the table directly. After SAN-1206 the signed-in role holds no UPDATE on
 * public.showings at all, so the RPC is the only route to a legal transition — and it is the
 * database, not this function, that decides whether the caller may act.
 */
export async function runBrokerViewingAction(
  supabase: DbClient,
  params: BrokerViewingActionParams,
): Promise<RunBrokerViewingActionResult> {
  const { data, error } = await supabase.rpc("p1_broker_update_showing", {
    p_showing_id: params.showingId,
    p_action: params.action,
    p_expected_status: params.expectedStatus,
    p_expected_scheduled_at: params.expectedScheduledAt,
    // `undefined` rather than `null` so the argument is omitted from the request body and
    // Postgres applies the parameter's own DEFAULT NULL. Sending an explicit null would work
    // for this function but would break the moment the default becomes non-null.
    p_new_scheduled_at: params.newScheduledAt ?? undefined,
  });

  if (error) {
    return viewingActionFailure(error.message, error.code ?? undefined);
  }

  const showing = parseBrokerViewingOutcome(data);
  if (!showing) {
    return viewingActionFailure("The viewing action returned an unexpected payload.");
  }

  return { ok: true, showing };
}
