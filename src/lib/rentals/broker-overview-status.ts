/**
 * SAN-1710 — the canonical Overview status vocabulary.
 *
 * The database is the source of truth and its constraints are narrow:
 * `leads_status_check` allows new | contacted | qualified | lost | converted, and
 * `showings_status_check` allows scheduled | confirmed | completed | cancelled | no_show.
 * The Overview must not invent a status or silently count a closed row as open, so
 * every read below names the exact set it means.
 */

/** A lead the broker still owes work on. `lost` and `converted` are closed. */
export const BROKER_OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"] as const;

/** A lead that has arrived and has not been contacted at all. */
export const BROKER_UNANSWERED_LEAD_STATUSES = ["new"] as const;

/**
 * A live appointment: it is still going to happen and is not finished.
 * `completed`, `cancelled` and `no_show` are history, not today's schedule.
 */
export const BROKER_APPOINTMENT_STATUSES = ["scheduled", "confirmed"] as const;

/**
 * An appointment the broker still has to answer. The database stores `scheduled`;
 * the broker reads it as "Requested" through `brokerViewingStatusLabel`.
 */
export const BROKER_PENDING_APPOINTMENT_STATUSES = ["scheduled"] as const;
