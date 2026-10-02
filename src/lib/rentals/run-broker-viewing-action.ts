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
 * The SQLSTATE contract raised deliberately by p1_broker_update_showing.
 *
 *   42501 authentication/authorization refused      -> 403
 *   PT404 showing not found                         -> 404
 *   22023 malformed or non-future reschedule input  -> 400
 *   PT409 stale expected state, or a transition the current state does not permit -> 409
 *
 * PT404/PT409 are PostgREST's documented HTTP mapping, so the RPC carries the right status on
 * its own at /rest/v1/rpc/... as well. The route repeats the mapping rather than trusting the
 * transport, because the status the caller sees must not depend on which layer got there first.
 */
const RPC_CODE_STATUS: Record<string, 400 | 403 | 404 | 409> = {
  PT409: 409,
  "42501": 403,
  PT404: 404,
  "22023": 400,
};

/**
 * Patterns for a failure that reached us with no SQLSTATE at all — a transport or client error.
 *
 * Deliberately narrow, and only ever consulted when no code is present. A message is prose the
 * RPC is free to reword, so matching on it can silently reclassify a refusal: an earlier
 * revision OR'd the code and message checks together with a bare `/cannot be/` pattern and a
 * 409 branch listed first, which turned a genuine 42501 whose text happened to contain those
 * words into a 409. The database is the authority on why a transition was refused, so a code
 * that IS present decides the status on its own.
 */
const MESSAGE_STATUS: Array<[RegExp, 400 | 403 | 404 | 409]> = [
  [/showing changed since it was loaded|another viewing already occupies that day/i, 409],
  [/authentication required|does not own this showing/i, 403],
  [/showing not found/i, 404],
  [/reschedule (requires|time must)/i, 400],
];

function viewingActionFailure(
  message: string,
  code?: string,
): Extract<RunBrokerViewingActionResult, { ok: false }> {
  if (code) {
    const status = RPC_CODE_STATUS[code];
    if (status !== undefined) {
      return { ok: false, message, status };
    }
    // An UNRECOGNISED code is not guessed at from the message — we cannot classify it, and 500
    // is the honest status. Log it so a newly introduced refusal code is observable in
    // production instead of surfacing only as a generic broker error.
    console.error(`[broker-viewing-action] unmapped SQLSTATE ${code}: ${message}`);
    return { ok: false, message, status: 500 };
  }

  for (const [pattern, status] of MESSAGE_STATUS) {
    if (pattern.test(message)) {
      return { ok: false, message, status };
    }
  }

  console.error(`[broker-viewing-action] unclassified failure without SQLSTATE: ${message}`);
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
