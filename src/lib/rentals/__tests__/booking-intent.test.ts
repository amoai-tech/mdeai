import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createApartmentBookingIntent,
  createSupabaseBookingIntentStore,
  type BookingIntentBooking,
  type BookingIntentStore,
} from "../booking-intent";
import { bookingIntentInputSchema, type BookingIntentInput } from "../booking-intent-schema";
import { rentalToday } from "../date-only";

const APARTMENT = { id: "11111111-1111-4111-8111-111111111111", title: "Laureles 2BR" };
const OTHER_APARTMENT = { id: "22222222-2222-4222-8222-222222222222", title: "Poblado 1BR" };
const USER = "33333333-3333-4333-8333-333333333333";

const input = (overrides: Partial<BookingIntentInput> = {}): BookingIntentInput => ({
  apartmentId: APARTMENT.id,
  startDate: "2026-12-01",
  idempotencyKey: "bi-4f6c0a1e-2b3d-4c5e-8f90-123456789abc",
  ...overrides,
});

type StoredBooking = BookingIntentBooking & { userId: string; idempotencyKey: string };

function makeStore(apartments = [APARTMENT, OTHER_APARTMENT]) {
  const bookings: StoredBooking[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const store: BookingIntentStore = {
    async findApartment(id) {
      return apartments.find((apartment) => apartment.id === id) ?? null;
    },
    async findBookingByKey(userId, key) {
      return (
        bookings.find(
          (booking) => booking.idempotencyKey === key && booking.userId === userId,
        ) ?? null
      );
    },
    async insertBooking(row) {
      inserts.push(row as unknown as Record<string, unknown>);
      const created: StoredBooking = {
        id: `booking-${bookings.length + 1}`,
        userId: row.userId,
        idempotencyKey: row.idempotencyKey,
        resourceId: row.apartmentId,
        resourceTitle: row.apartmentTitle,
        startDate: row.startDate,
        endDate: row.endDate,
        status: "pending",
        paymentStatus: "pending",
        createdAt: "2026-10-30T00:00:00.000Z",
      };
      bookings.push(created);
      return { created };
    },
  };
  return { store, bookings, inserts };
}

describe("bookingIntentInputSchema", () => {
  const base = {
    apartmentId: APARTMENT.id,
    idempotencyKey: "bi-4f6c0a1e-2b3d-4c5e-8f90-123456789abc",
  };

  it("accepts today and later in the rental timezone, rejects a past move-in date", () => {
    expect(bookingIntentInputSchema.safeParse({ ...base, startDate: rentalToday() }).success).toBe(true);
    expect(bookingIntentInputSchema.safeParse({ ...base, startDate: "2020-01-01" }).success).toBe(false);
  });

  it("rejects non-existent calendar days and reversed booking ranges", () => {
    expect(bookingIntentInputSchema.safeParse({ ...base, startDate: "2026-13-40" }).success).toBe(false);
    expect(bookingIntentInputSchema.safeParse({ ...base, startDate: "2026-12-01", endDate: "2026-02-30" }).success).toBe(false);
    expect(bookingIntentInputSchema.safeParse({ ...base, startDate: "2026-12-15", endDate: "2026-12-01" }).success).toBe(false);
    expect(bookingIntentInputSchema.safeParse({ ...base, startDate: "2026-12-01", endDate: "2026-12-15" }).success).toBe(true);
  });

  it("rejects a malformed date and a weak idempotency key", () => {
    expect(bookingIntentInputSchema.safeParse({ ...base, startDate: "12/01/2026" }).success).toBe(false);
    expect(
      bookingIntentInputSchema.safeParse({ ...base, startDate: rentalToday(), idempotencyKey: "short" })
        .success,
    ).toBe(false);
  });
});

describe("createApartmentBookingIntent", () => {
  it("creates exactly one pending booking for a new key", async () => {
    const { store, bookings, inserts } = makeStore();
    const result = await createApartmentBookingIntent(store, USER, input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replayed).toBe(false);
    expect(result.booking).toMatchObject({
      resourceId: APARTMENT.id,
      resourceTitle: APARTMENT.title,
      startDate: "2026-12-01",
      endDate: null,
      status: "pending",
      paymentStatus: "pending",
    });
    expect(bookings).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      userId: USER,
      apartmentId: APARTMENT.id,
      idempotencyKey: input().idempotencyKey,
    });
  });

  it("returns the same booking when the identical request is retried with the same key", async () => {
    const { store, bookings, inserts } = makeStore();
    const first = await createApartmentBookingIntent(store, USER, input());
    const retry = await createApartmentBookingIntent(store, USER, input());

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.booking.id).toBe(first.booking.id);
    expect(bookings).toHaveLength(1);
    expect(inserts).toHaveLength(1);
  });

  it("answers 409-style conflict when the same key is reused with different dates", async () => {
    const { store, bookings } = makeStore();
    await createApartmentBookingIntent(store, USER, input());
    const conflict = await createApartmentBookingIntent(
      store,
      USER,
      input({ startDate: "2026-12-05" }),
    );

    expect(conflict).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    expect(bookings).toHaveLength(1);
  });

  it("answers conflict when the same key is reused for a different apartment", async () => {
    const { store, bookings } = makeStore();
    await createApartmentBookingIntent(store, USER, input());
    const conflict = await createApartmentBookingIntent(
      store,
      USER,
      input({ apartmentId: OTHER_APARTMENT.id }),
    );

    expect(conflict).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    expect(bookings).toHaveLength(1);
  });

  it("treats an omitted end date and an explicit null as the same request", async () => {
    const { store, bookings } = makeStore();
    await createApartmentBookingIntent(store, USER, input());
    const retry = await createApartmentBookingIntent(store, USER, input({ endDate: null }));

    expect(retry.ok).toBe(true);
    expect(bookings).toHaveLength(1);
  });

  it("recovers the winning booking when a simultaneous insert hits the unique index", async () => {
    const { store, bookings } = makeStore();
    const realInsert = store.insertBooking;
    let racedOnce = false;
    store.insertBooking = async (row) => {
      if (!racedOnce) {
        racedOnce = true;
        // The concurrent request committed first; this connection sees the duplicate.
        await realInsert({ ...row });
        return { duplicate: true };
      }
      return realInsert(row);
    };

    const result = await createApartmentBookingIntent(store, USER, input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replayed).toBe(true);
    expect(result.booking.id).toBe("booking-1");
    expect(bookings).toHaveLength(1);
  });

  it("does not create a booking for an apartment the renter cannot read", async () => {
    const { store, inserts } = makeStore();
    const result = await createApartmentBookingIntent(
      store,
      USER,
      input({ apartmentId: "99999999-9999-4999-8999-999999999999" }),
    );

    expect(result).toEqual({ ok: false, code: "APARTMENT_NOT_FOUND" });
    expect(inserts).toHaveLength(0);
  });

  it("scopes the idempotency lookup to the acting user", async () => {
    const { store } = makeStore();
    const findSpy = vi.spyOn(store, "findBookingByKey");
    await createApartmentBookingIntent(store, USER, input());
    expect(findSpy).toHaveBeenCalledWith(USER, input().idempotencyKey);
  });
});

/**
 * The database trigger rejects client-supplied prices, currency, confirmation and payment
 * state for apartment bookings. The adapter must therefore send none of them — otherwise a
 * rename or a "helpful" refactor would start failing at runtime instead of here.
 */
describe("createSupabaseBookingIntentStore.insertBooking", () => {
  it("writes a pending, unpriced intent and never sends server-controlled fields", async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from(table: string) {
        expect(table).toBe("bookings");
        return {
          insert(row: Record<string, unknown>) {
            captured = row;
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: "44444444-4444-4444-8444-444444444444",
                    resource_id: row.resource_id,
                    resource_title: row.resource_title,
                    start_date: row.start_date,
                    end_date: row.end_date,
                    status: row.status,
                    payment_status: row.payment_status,
                    created_at: "2026-10-30T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseBookingIntentStore(supabase);
    const result = await store.insertBooking({
      userId: USER,
      apartmentId: APARTMENT.id,
      apartmentTitle: APARTMENT.title,
      startDate: "2026-12-01",
      endDate: null,
      idempotencyKey: input().idempotencyKey,
    });

    expect("created" in result).toBe(true);
    expect(captured).toMatchObject({
      user_id: USER,
      booking_type: "apartment",
      resource_id: APARTMENT.id,
      resource_title: APARTMENT.title,
      start_date: "2026-12-01",
      end_date: null,
      status: "pending",
      payment_status: "pending",
    });
    for (const forbidden of [
      "currency",
      "unit_price",
      "total_price",
      "confirmation_code",
      "confirmed_at",
      "payment_reference",
      "payment_method",
      "partner_status",
    ]) {
      expect(captured).not.toHaveProperty(forbidden);
    }
  });
});
