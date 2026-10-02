/**
 * SAN-1206 · Broker viewing actions — the pure decision layer.
 *
 * Every function here is a pure function of persisted state. Keeping them out of the component
 * means the "which buttons exist" rule, the "which word the broker reads" rule and the wire
 * schema can all be tested without a DOM, and the route and the card cannot drift apart.
 */

export const BROKER_VIEWING_ACTIONS = ["confirm", "cancel", "reschedule"] as const;

export type BrokerViewingAction = (typeof BROKER_VIEWING_ACTIONS)[number];

/**
 * The word the broker reads for a persisted status.
 *
 * `scheduled` is a database state, not something a person says. From the broker's side a
 * `scheduled` row is a request nobody has answered yet, so it reads as "Requested". The
 * database value is deliberately NOT changed: `showings_status_check` has no `pending` state
 * and inventing one would fork the status vocabulary every other query already relies on.
 */
export function brokerViewingStatusLabel(status: string): string {
  if (!status) {
    return "Unknown";
  }
  if (status === "scheduled") {
    return "Requested";
  }
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

/**
 * The actions the broker is allowed to take from a given persisted status.
 *
 * This mirrors the database contract in 20260929174626_san1206_broker_viewing_actions.sql:
 * `confirmed` may only be cancelled, and the three closed statuses are read-only. Deriving the
 * buttons from the persisted status — rather than from what the user just clicked — is what
 * stops the UI offering an action the RPC will refuse.
 */
export function availableBrokerViewingActions(status: string): BrokerViewingAction[] {
  if (status === "scheduled") {
    return ["confirm", "cancel", "reschedule"];
  }
  if (status === "confirmed") {
    return ["cancel"];
  }
  return [];
}

/** Read-only statuses render no controls at all. */
export function isBrokerViewingStatusReadOnly(status: string): boolean {
  return availableBrokerViewingActions(status).length === 0;
}

export function isBrokerViewingAction(value: unknown): value is BrokerViewingAction {
  return (
    typeof value === "string" &&
    (BROKER_VIEWING_ACTIONS as readonly string[]).includes(value)
  );
}

/** Per-action button text, kept here so the card and its test agree on one source. */
export const BROKER_VIEWING_ACTION_LABELS: Record<BrokerViewingAction, string> = {
  confirm: "Confirm",
  cancel: "Decline",
  reschedule: "Reschedule",
};

/** Human-facing label for an action in the current persisted state. */
export function brokerViewingActionLabel(action: BrokerViewingAction, status: string): string {
  if (action === "cancel" && status === "confirmed") {
    return "Cancel";
  }
  return BROKER_VIEWING_ACTION_LABELS[action];
}

/**
 * The two authoritative values the caller believed it was acting on.
 *
 * These are sent back to the route on every action. The database compares them against the
 * locked row, so an action computed from a page the broker left open cannot overwrite a newer
 * outcome — it comes back as a conflict instead.
 */
export type BrokerViewingExpectation = {
  expectedStatus: string;
  expectedScheduledAt: string;
};
