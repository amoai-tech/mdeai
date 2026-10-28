import { describe, expect, it, vi } from "vitest";
import { fetchLatestVenueBookingStatus } from "@/lib/venues/fetch-latest-venue-booking-status";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

function mockSupabase(row: { id: string; status: string; created_at: string } | null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eqKind = vi.fn(() => ({ order }));
  const eqPlace = vi.fn(() => ({ eq: eqKind }));
  const eqUser = vi.fn(() => ({ eq: eqPlace }));
  const select = vi.fn(() => ({ eq: eqUser }));
  const from = vi.fn(() => ({ select }));
  return { from, eqUser, eqPlace, eqKind } as unknown as SupabaseClient<Database> & {
    eqUser: ReturnType<typeof vi.fn>;
    eqPlace: ReturnType<typeof vi.fn>;
    eqKind: ReturnType<typeof vi.fn>;
  };
}

describe("fetchLatestVenueBookingStatus", () => {
  it("filters by place_id and venue_kind", async () => {
    const supabase = mockSupabase({
      id: "row-1",
      status: "pending",
      created_at: "2026-06-02T00:00:00Z",
    });

    const result = await fetchLatestVenueBookingStatus(supabase, {
      userId: "customer-1",
      placeId: "ChIJven021proof01",
      venueKind: "nightclub",
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.requestId).toBe("row-1");
      expect(result.data.status).toBe("pending");
    }
    expect(supabase.from).toHaveBeenCalledWith("venue_booking_requests");
    expect(supabase.eqPlace).toHaveBeenCalledWith(
      "place_id",
      "ChIJven021proof01",
    );
    expect(supabase.eqUser).toHaveBeenCalledWith("user_id", "customer-1");
    expect(supabase.eqKind).toHaveBeenCalledWith("venue_kind", "nightclub");
  });

  it("uses the canonical restaurant UUID to read pending status without Google ID", async () => {
    const supabase = mockSupabase({
      id: "uuid-only-receipt", status: "pending", created_at: "2026-10-28T00:00:00Z",
    });
    const result = await fetchLatestVenueBookingStatus(supabase, {
      userId: "customer-1",
      restaurantId: "a1b2c3d4-e5f6-4789-abcd-100000000005",
      venueKind: "restaurant",
    });
    expect(result).toMatchObject({ ok: true, data: { requestId: "uuid-only-receipt", status: "pending" } });
    expect(supabase.eqPlace).toHaveBeenCalledWith("restaurant_id", "a1b2c3d4-e5f6-4789-abcd-100000000005");
    expect(supabase.eqUser).toHaveBeenCalledWith("user_id", "customer-1");
    expect(supabase.eqKind).toHaveBeenCalledWith("venue_kind", "restaurant");
  });

  it("returns null when no row", async () => {
    const supabase = mockSupabase(null);
    const result = await fetchLatestVenueBookingStatus(supabase, {
      userId: "customer-1",
      placeId: "ChIJabcdefghijklmnop",
      venueKind: "cafe",
    });
    expect(result).toEqual({ ok: true, data: null });
  });
});
