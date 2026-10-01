import { z } from "zod";
import { BROKER_VIEWING_ACTIONS } from "./broker-viewing-action";

/**
 * The status vocabulary `showings_status_check` actually allows. Validating against it here
 * turns a malformed `expectedStatus` into a clean 400, instead of letting the database compare
 * nonsense to the locked row and answer with a 409 conflict that blames the wrong thing.
 */
export const BROKER_VIEWING_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

/**
 * SAN-1206 · the wire contract for PATCH /api/host/rentals/viewings/[id].
 *
 * `newWallClock` is the raw `datetime-local` string, NOT an instant. The browser's value has no
 * offset, so the server owns the conversion through `resolvePreferredAtInstant()` — that is the
 * only way one typed "15:00" keeps meaning 3:00 PM in Medellín regardless of where the browser
 * is, or what timezone the Vercel process happens to run in.
 */
export const brokerViewingActionRequestSchema = z.object({
  action: z.enum(BROKER_VIEWING_ACTIONS),
  expectedStatus: z.enum(BROKER_VIEWING_STATUSES),
  // Must be an ISO 8601 instant WITH an offset. PostgREST renders timestamptz as `+00:00`, so
  // the echoed value always qualifies. A looser Date.parse guard also accepted prose and
  // offset-free strings, which Postgres would then read in the session timezone — turning the
  // caller's malformed input into a confusing 409 instead of a clean 400.
  expectedScheduledAt: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/.test(value) &&
        !Number.isNaN(Date.parse(value)),
      { message: "expectedScheduledAt must be an ISO 8601 timestamp with an offset" },
    ),
  newWallClock: z.string().trim().min(1).max(32).optional(),
});

export type BrokerViewingActionRequest = z.infer<typeof brokerViewingActionRequestSchema>;
