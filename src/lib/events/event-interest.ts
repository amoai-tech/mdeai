/** A follow is consent to in-app updates about one event — never a ticket or a booking. */
export const EVENT_INTEREST_TYPE = "event_ticket_available" as const;

// Stored event ids are plain Postgres uuids; several do not carry an RFC version nibble,
// so validate the uuid shape rather than a version pattern.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEventId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export type InterestResult =
  | { ok: true; following: boolean }
  | { ok: false; error: "not-signed-in" | "invalid-event" | "failed" };

/** Map a Supabase error or a missing session onto the two states the UI can render. */
export function interestOutcome(
  following: boolean,
  error: { code?: string; message?: string } | null,
): InterestResult {
  if (error) {
    // 23505 is a duplicate follow, which is success for an idempotent button.
    if (error.code === "23505") return { ok: true, following: true };
    return { ok: false, error: "failed" };
  }
  return { ok: true, following };
}
