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
  // Must already be a parseable instant; otherwise Postgres raises a cast error and the caller
  // gets a 500 for what is plainly their own malformed input.
  expectedScheduledAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "expectedScheduledAt must be a parseable timestamp",
    }),
  newWallClock: z.string().trim().min(1).max(32).optional(),
});

export type BrokerViewingActionRequest = z.infer<typeof brokerViewingActionRequestSchema>;
