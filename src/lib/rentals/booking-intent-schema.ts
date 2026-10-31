import { z } from "zod";
import { isOrderedStay, isRealCalendarDate, rentalToday } from "./date-only";

/**
 * SAN-1234 / SAN-481 — the request contract for a rental booking intent.
 *
 * A booking intent is deliberately small: which apartment, when the renter wants to move
 * in, and the renter's own idempotency key. It carries **no price**: the database trigger
 * `guard_apartment_booking_payment_authority` rejects client-supplied amounts, currency,
 * payment state and confirmation for apartment bookings, so the amount is priced by the
 * server at payment time (SAN-1240), never invented here.
 */
export const BOOKING_INTENT_ERROR_MESSAGES = {
  UNAUTHENTICATED: "Sign in to review this booking.",
  VALIDATION_ERROR: "Check the apartment and move-in date, then try again.",
  APARTMENT_NOT_FOUND: "We couldn’t find that apartment.",
  IDEMPOTENCY_CONFLICT:
    "This booking request was already started with different details. Start a new review instead.",
  BOOKING_FAILED: "We couldn’t save your booking review. Please try again.",
} as const;

export type BookingIntentErrorCode = keyof typeof BOOKING_INTENT_ERROR_MESSAGES;

/** Client-generated once per review attempt and reused on retry, so a retry resumes. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

export const bookingIntentInputSchema = z.object({
  apartmentId: z.string().uuid("Choose a valid apartment."),
  startDate: z
    .string({ required_error: "Choose a move-in date." })
    .refine(isRealCalendarDate, "Choose a real move-in date.")
    // A move-in date in the past is not a booking anyone can act on. Compare calendar
    // dates in the rental timezone, never the server's UTC clock.
    .refine((value) => value >= rentalToday(), "Choose a move-in date today or later."),
  endDate: z.string().refine(isRealCalendarDate, "Choose a real end date.").nullish(),
  idempotencyKey: z
    .string({ required_error: "Refresh the page and try again." })
    .regex(IDEMPOTENCY_KEY_RE, "Refresh the page and try again."),
}).refine(
  (value) => isOrderedStay(value.startDate, value.endDate ?? undefined),
  { path: ["endDate"], message: "Move-out date cannot be before move-in." },
);

export type BookingIntentInput = z.infer<typeof bookingIntentInputSchema>;
