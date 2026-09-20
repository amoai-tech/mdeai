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
    .string({ required_error: "preferredAt is required" })
    .min(1)
    .max(40)
    // One pass: resolve once, then report validity and future-ness separately.
    .superRefine((value, ctx) => {
      const instant = resolvePreferredAtInstant(value);
      if (instant === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "preferredAt must be a valid Medellín-local date and time",
        });
        return;
      }
      if (!isFutureInstant(instant)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "preferredAt must be in the future",
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
