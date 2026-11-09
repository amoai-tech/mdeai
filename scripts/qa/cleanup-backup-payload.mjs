/**
 * The only shape a cleanup artifact may take: identifiers and counts.
 *
 * This file is uploaded as a CI artifact, so it must never contain:
 * - event `name` (free text — customers put addresses and phone numbers in it)
 * - account `email` (a personal identifier)
 * - profile, message or attendee fields (chat text, names, phones)
 *
 * It is also written only AFTER the transaction commits, so a rolled-back run cannot
 * leave an artifact that claims deletions succeeded.
 */
export function buildBackupPayload({ createdAt, events, children, identities, impact }) {
  return {
    createdAt,
    status: "committed",
    events: events.map((row) => row.id),
    childIds: Object.fromEntries(
      Object.entries(children).map(([table, rows]) => [
        table,
        // Child tables are keyed by `event_id`; only use `id` when the row has one.
        rows.map((row) => row.id ?? row.event_id ?? null).filter((id) => id !== null),
      ]),
    ),
    isolationIdentities: identities.map((row) => row.id),
    isolationIdentityImpact: impact,
  };
}
