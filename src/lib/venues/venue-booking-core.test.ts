import { describe, expect, it, vi } from "vitest";
import {
  buildVenueBookingIdempotencyKey,
  insertVenueBookingRequest,
} from "@/lib/venues/venue-booking-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const MDE_UUID = "936636a5-967a-4356-ac03-0a01ac553e1d";
const NOW = "2026-10-29T23:00:00.000Z";
const payload = {
  venueKind: "restaurant" as const,
  restaurantId: MDE_UUID,
  requestedAt: NOW,
  partySize: 2,
  contactName: "Camila",
  contactEmail: "camila@example.com",
};

function mockSupabase(options: {
  restaurant?: { id: string; google_place_id: string | null } | null;
  restaurantError?: { code?: string } | null;
  insertResult?: { data: { id: string } | null; error: { code?: string } | null };
  previous?: {
    id: string; venue_kind: string; restaurant_id: string | null;
    place_id: string | null; party_size: number | null; requested_at: string;
  } | null;
} = {}) {
  const insertSingle = vi.fn(async () => options.insertResult ?? {
    data: { id: "saved-request-id" }, error: null,
  });
  const restaurantSingle = vi.fn(async () => ({
    data: options.restaurant === undefined
      ? { id: MDE_UUID, google_place_id: null } : options.restaurant,
    error: options.restaurantError ?? null,
  }));
  const previousSingle = vi.fn(async () => ({ data: options.previous ?? null, error: null }));
  const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
  const previousEq = vi.fn(() => ({ eq: () => ({ maybeSingle: previousSingle }) }));
  const from = vi.fn((table: string) => {
    if (table === "restaurants") {
      return { select: () => ({ eq: () => ({ maybeSingle: restaurantSingle }) }) };
    }
    return { insert, select: () => ({ eq: previousEq }) };
  });
  return { from, insert, restaurantSingle, previousSingle } as unknown as
    SupabaseClient<Database> & {
      from: typeof from; insert: typeof insert;
      restaurantSingle: typeof restaurantSingle; previousSingle: typeof previousSingle;
    };
}

describe("buildVenueBookingIdempotencyKey", () => {
  const base = { venueKind: "cafe", placeId: "ChIJtest12345678", requestedAt: NOW, partySize: 2 };

  it("is stable, changes for different party sizes", () => {
    expect(buildVenueBookingIdempotencyKey(base)).toMatch(/^vb-[a-f0-9]{32}$/);
    expect(buildVenueBookingIdempotencyKey(base)).toBe(buildVenueBookingIdempotencyKey(base));
    expect(buildVenueBookingIdempotencyKey({ ...base, partySize: 4 })).not.toBe(buildVenueBookingIdempotencyKey(base));
  });

  it("uses the canonical restaurant UUID when Google enrichment changes", () => {
    const a = buildVenueBookingIdempotencyKey({ ...payload, placeId: null });
    const b = buildVenueBookingIdempotencyKey({ ...payload, placeId: "ChIJfake99999999" });
    expect(a).toBe(b);
  });

  it("refuses a missing restaurant and Place ID", () => {
    expect(() => buildVenueBookingIdempotencyKey({
      venueKind: "restaurant", requestedAt: NOW, partySize: 2,
    })).toThrow("Missing booking resource");
  });
});

describe("insertVenueBookingRequest", () => {
  it("rejects missing identifiers", async () => {
    const supabase = mockSupabase();
    const result = await insertVenueBookingRequest(supabase, "user-1", { ...payload, restaurantId: undefined });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("persists a pending restaurant request using only its MDE UUID", async () => {
    const supabase = mockSupabase();
    const result = await insertVenueBookingRequest(supabase, "user-1", payload);
    expect(result).toMatchObject({ ok: true, data: { requestId: "saved-request-id" } });
    expect(supabase.from).toHaveBeenCalledWith("restaurants");
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      place_id: null, restaurant_id: MDE_UUID, status: "pending", user_id: "user-1",
    }));
  });

  it("rejects nonexistent UUID without writing a request", async () => {
    const supabase = mockSupabase({ restaurant: null });
    const result = await insertVenueBookingRequest(supabase, "user-1", payload);
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("accepts a correctly matched restaurant UUID and Google Place ID for the owner inbox", async () => {
    const placeId = "ChIJcorrectRestaurant";
    const supabase = mockSupabase({ restaurant: { id: MDE_UUID, google_place_id: placeId } });
    const result = await insertVenueBookingRequest(supabase, "user-1", { ...payload, placeId });
    expect(result.ok).toBe(true);
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      restaurant_id: MDE_UUID, place_id: placeId, status: "pending",
    }));
  });

  it("rejects an invalid request body before any database operation", async () => {
    const supabase = mockSupabase();
    const result = await insertVenueBookingRequest(supabase, "user-1", { venueKind: "bad" });
    expect(result).toEqual({ ok: false, status: 400, message: "Validation failed" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects forged Google ID that does not match the restaurant UUID", async () => {
    const supabase = mockSupabase({ restaurant: { id: MDE_UUID, google_place_id: "ChIJtrue12345678" } });
    const result = await insertVenueBookingRequest(supabase, "user-1", {
      ...payload, placeId: "ChIJwrong1234567",
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("links an MDE restaurant when the booking only includes its known Google ID", async () => {
    const supabase = mockSupabase({ restaurant: { id: MDE_UUID, google_place_id: "ChIJknown123456" } });
    const result = await insertVenueBookingRequest(supabase, "user-1", {
      ...payload, restaurantId: undefined, placeId: "ChIJknown123456",
    });
    expect(result.ok).toBe(true);
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      restaurant_id: MDE_UUID, place_id: "ChIJknown123456",
    }));
  });

  it("retains Place ID-only café and nightclub requests", async () => {
    const supabase = mockSupabase();
    const result = await insertVenueBookingRequest(supabase, "user-1", {
      ...payload, venueKind: "nightclub", restaurantId: undefined,
      placeId: "ChIJnightlife12345",
    });
    expect(result.ok).toBe(true);
    expect(supabase.from).not.toHaveBeenCalledWith("restaurants");
  });

  it("recovers the same receipt after a transient response loss, no duplicate row", async () => {
    const supabase = mockSupabase({
      insertResult: { data: null, error: { code: "23505" } },
      previous: {
        id: "first-saved-request", venue_kind: "restaurant",
        place_id: null, restaurant_id: MDE_UUID,
        requested_at: NOW, party_size: 2,
      },
    });
    const result = await insertVenueBookingRequest(supabase, "user-1", payload);
    expect(result).toMatchObject({ ok: true, data: { requestId: "first-saved-request" } });
    expect(supabase.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects an idempotency key reused for a different booking", async () => {
    const supabase = mockSupabase({
      insertResult: { data: null, error: { code: "23505" } },
      previous: {
        id: "other-request", venue_kind: "restaurant", place_id: null,
        restaurant_id: MDE_UUID, requested_at: NOW, party_size: 9,
      },
    });
    const result = await insertVenueBookingRequest(supabase, "user-1", payload);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });
});
