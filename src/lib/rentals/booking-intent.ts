import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingIntentErrorCode, BookingIntentInput } from "./booking-intent-schema";

/**
 * SAN-1234 — one conditional-apartment booking intent.
 *
 * The canonical `bookings` table already carries the duplicate prevention: the partial
 * unique index `idx_bookings_apartment_idempotency` on `(user_id, idempotency_key)` for
 * `booking_type = 'apartment'` (migration 20261030185539, PR #628). This module adds the
 * request semantics on top of it and never invents a second ledger:
 *
 *   new key                                  -> create one pending booking
 *   same key + same apartment and dates      -> return that same booking (retry safe)
 *   same key + different apartment/dates     -> IDEMPOTENCY_CONFLICT (409), nothing written
 *   two simultaneous identical requests      -> the unique index lets one insert win; the
 *                                               loser re-reads and returns the same booking
 *
 * Amounts, currency, payment state and confirmation stay server controlled by the database
 * trigger, so this intent is intentionally unpriced.
 */
export type BookingIntentBooking = {
  id: string;
  resourceId: string;
  resourceTitle: string;
  startDate: string;
  endDate: string | null;
  status: string;
  paymentStatus: string | null;
  createdAt: string;
};

export type BookingIntentResult =
  | { ok: true; booking: BookingIntentBooking; replayed: boolean }
  | { ok: false; code: BookingIntentErrorCode };

export type NewBookingIntentRow = {
  userId: string;
  apartmentId: string;
  apartmentTitle: string;
  startDate: string;
  endDate: string | null;
  idempotencyKey: string;
};

/** Narrow persistence seam so the request semantics are testable without a database. */
export type BookingIntentStore = {
  findApartment(id: string): Promise<{ id: string; title: string | null } | null>;
  findBookingByKey(userId: string, idempotencyKey: string): Promise<BookingIntentBooking | null>;
  insertBooking(
    row: NewBookingIntentRow,
  ): Promise<{ created: BookingIntentBooking } | { duplicate: true }>;
};

const sameRequest = (booking: BookingIntentBooking, input: BookingIntentInput) =>
  booking.resourceId === input.apartmentId &&
  booking.startDate === input.startDate &&
  booking.endDate === (input.endDate ?? null);

const replay = (booking: BookingIntentBooking): BookingIntentResult => ({
  ok: true,
  booking,
  replayed: true,
});

export async function createApartmentBookingIntent(
  store: BookingIntentStore,
  userId: string,
  input: BookingIntentInput,
): Promise<BookingIntentResult> {
  // Resolve an already-committed intent BEFORE reading the listing. A retry must resume the
  // booking it created even if the apartment has since become unreadable (unpublished,
  // deleted, or temporarily RLS-hidden), and reusing the key for another apartment must be a
  // conflict rather than a misleading 404.
  const existing = await store.findBookingByKey(userId, input.idempotencyKey);
  if (existing) {
    return sameRequest(existing, input) ? replay(existing) : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
  }

  // Only a genuinely new intent needs the listing: reading it proves the renter can see it,
  // and its title is captured on the booking at creation time.
  const apartment = await store.findApartment(input.apartmentId);
  if (!apartment) {
    return { ok: false, code: "APARTMENT_NOT_FOUND" };
  }

  const inserted = await store.insertBooking({
    userId,
    apartmentId: apartment.id,
    apartmentTitle: apartment.title ?? "Apartment",
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    idempotencyKey: input.idempotencyKey,
  });

  if ("created" in inserted) {
    return { ok: true, booking: inserted.created, replayed: false };
  }

  // The unique index rejected the insert: a simultaneous request with the same key won.
  const raced = await store.findBookingByKey(userId, input.idempotencyKey);
  if (!raced) {
    return { ok: false, code: "BOOKING_FAILED" };
  }
  return sameRequest(raced, input) ? replay(raced) : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
}

const BOOKING_COLUMNS =
  "id, resource_id, resource_title, start_date, end_date, status, payment_status, created_at";

type BookingRow = {
  id: string;
  resource_id: string;
  resource_title: string;
  start_date: string;
  end_date: string | null;
  status: string;
  payment_status: string | null;
  created_at: string;
};

const toBooking = (row: BookingRow): BookingIntentBooking => ({
  id: row.id,
  resourceId: row.resource_id,
  resourceTitle: row.resource_title,
  startDate: row.start_date,
  endDate: row.end_date,
  status: row.status,
  paymentStatus: row.payment_status,
  createdAt: row.created_at,
});

const UNIQUE_VIOLATION = "23505";

/** Adapter over the caller's own RLS-governed client — no service role, no bypass. */
export function createSupabaseBookingIntentStore(supabase: SupabaseClient): BookingIntentStore {
  return {
    async findApartment(id) {
      const { data, error } = await supabase
        .from("apartments")
        .select("id, title")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: String(data.id), title: (data.title as string | null) ?? null };
    },

    async findBookingByKey(userId, idempotencyKey) {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .eq("user_id", userId)
        .eq("booking_type", "apartment")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw error;
      return data ? toBooking(data as BookingRow) : null;
    },

    async insertBooking(row) {
      const { data, error } = await supabase
        .from("bookings")
        .insert({
          user_id: row.userId,
          booking_type: "apartment",
          resource_id: row.apartmentId,
          resource_title: row.apartmentTitle,
          start_date: row.startDate,
          end_date: row.endDate,
          idempotency_key: row.idempotencyKey,
          status: "pending",
          payment_status: "pending",
        })
        .select(BOOKING_COLUMNS)
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { duplicate: true };
        throw error;
      }
      return { created: toBooking(data as BookingRow) };
    },
  };
}
