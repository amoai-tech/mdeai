import { z } from "zod";
import { isFutureInstant, resolvePreferredAtInstant } from "./schedule-viewing-time";

/**
 * SAN-1203 — the single request contract for a rental viewing request.
 *
 * A request is only meaningful with a future viewing time, so `preferredAt` is
 * required and validated against the listing-local instants the server can
 * actually commit. The value crossing this boundary stays the raw
 * `datetime-local` wall clock; the API route canonicalises it to UTC.
 */
export const scheduleViewingInputSchema = z.object({
  listingId: z.string().min(1).max(120),
  listingTitle: z.string().min(1).max(200),
  neighborhood: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email().max(120),
  phone: z.string().max(40).optional(),
  preferredAt: z
    .string({ required_error: "Choose a viewing time." })
    .min(1)
    .max(40)
    // One pass: resolve once, then report validity and future-ness separately.
    .superRefine((value, ctx) => {
      const instant = resolvePreferredAtInstant(value);
      if (instant === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choose a valid viewing date and time (Medellín time).",
        });
        return;
      }
      if (!isFutureInstant(instant)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choose a viewing time in the future.",
        });
      }
    }),
  tripId: z.string().uuid().optional(),
});

export type ScheduleViewingInput = z.infer<typeof scheduleViewingInputSchema>;

/** Typed failure vocabulary shared by the API route and its browser caller. */
export const scheduleViewingErrorCodes = [
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "SHOWING_NOT_COMMITTED",
  "UPSTREAM_ERROR",
] as const;

export type ScheduleViewingErrorCode = (typeof scheduleViewingErrorCodes)[number];

/**
 * The `message` a renter sees for each failure code — the only prose the API may return.
 *
 * The lead-capture edge function answers with raw Postgres/plpgsql text
 * (`p1_schedule_tour_atomic: …`, unique-violation details), so forwarding an upstream
 * message would show a database error to someone trying to book a viewing. Upstream detail
 * stays in the server log; the renter gets this copy.
 */
export const SCHEDULE_VIEWING_ERROR_MESSAGES = {
  VALIDATION_ERROR: "Please check your viewing details and try again.",
  RATE_LIMITED: "Too many viewing requests — please wait a minute and try again.",
  SHOWING_NOT_COMMITTED: "We couldn't confirm your viewing was saved. Please try again.",
  UPSTREAM_ERROR: "We couldn't send your viewing request. Please try again.",
} as const satisfies Record<ScheduleViewingErrorCode, string>;

/**
 * SAN-1203 — success requires BOTH committed ids. `showingId` is not optional:
 * a response without it can never be rendered as a successful request.
 */
export type ScheduleViewingResult = {
  leadId: string;
  showingId: string;
  message: string;
};

export const SCHEDULE_VIEWING_ACK_MESSAGE =
  "Viewing request received — awaiting host confirmation.";
