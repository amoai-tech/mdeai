import { NextResponse } from "next/server";
import {
  BOOKING_INTENT_ERROR_MESSAGES,
  bookingIntentInputSchema,
  type BookingIntentErrorCode,
} from "@/lib/rentals/booking-intent-schema";
import {
  createApartmentBookingIntent,
  createSupabaseBookingIntentStore,
} from "@/lib/rentals/booking-intent";
import { createClient } from "@/lib/supabase/server";

/**
 * SAN-1234 — the authenticated rental booking-intent endpoint.
 *
 *   POST /api/rentals/bookings
 *   { apartmentId, startDate, endDate?, idempotencyKey }
 *
 * 201 a new pending booking, 200 the same booking replayed for an identical retry,
 * 409 when that key is reused with different dates or apartment, 401 anonymous.
 * The caller's own RLS client writes the row; amounts and payment state stay
 * database-controlled, so this route cannot price or settle anything.
 */
function failure(code: BookingIntentErrorCode, status: number, message?: string) {
  return NextResponse.json(
    { success: false, error: { code, message: message ?? BOOKING_INTENT_ERROR_MESSAGES[code] } },
    { status },
  );
}

const STATUS_FOR: Record<BookingIntentErrorCode, number> = {
  UNAUTHENTICATED: 401,
  VALIDATION_ERROR: 400,
  APARTMENT_NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  BOOKING_FAILED: 500,
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("VALIDATION_ERROR", 400);
  }

  const parsed = bookingIntentInputSchema.safeParse(body);
  if (!parsed.success) {
    return failure("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return failure("UNAUTHENTICATED", 401);
  }

  try {
    const result = await createApartmentBookingIntent(
      createSupabaseBookingIntentStore(supabase),
      user.id,
      parsed.data,
    );
    if (!result.ok) {
      return failure(result.code, STATUS_FOR[result.code]);
    }
    return NextResponse.json(
      { success: true, replayed: result.replayed, booking: result.booking },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    // Diagnostic detail stays in the server log; the renter gets safe copy.
    console.error("[api/rentals/bookings] booking intent failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return failure("BOOKING_FAILED", 500);
  }
}
