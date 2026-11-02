import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueBookingKind } from "@/lib/venues/venue-booking-form-schema";
import { normalizeVenueBookingStatus } from "@/lib/venues/venue-booking-status-display";

export type LatestVenueBookingStatus = {
  requestId: string;
  status: string;
  createdAt: string;
};

export async function fetchLatestVenueBookingStatus(
  supabase: SupabaseClient<Database>,
  input: { userId: string; placeId?: string; restaurantId?: string; venueKind: VenueBookingKind },
): Promise<
  | { ok: true; data: LatestVenueBookingStatus | null }
  | { ok: false; message: string }
> {
  // MDE restaurants use their stable UUID even when Google identity is absent
  // or changes. External restaurants, cafés and clubs continue using Place ID.
  const restaurantId = input.venueKind === "restaurant" ? input.restaurantId?.trim() : undefined;
  const resourceColumn = restaurantId ? "restaurant_id" : "place_id";
  const resourceId = restaurantId ?? input.placeId?.trim();
  if (!input.userId || !resourceId || resourceId.length < 8) {
    return { ok: true, data: null };
  }

  const { data, error } = await supabase
    .from("venue_booking_requests")
    .select("id, status, created_at")
    // Partner/admin RLS also grants read access, so the customer chip must
    // explicitly scope to the signed-in user's own request.
    .eq("user_id", input.userId)
    .eq(resourceColumn, resourceId)
    .eq("venue_kind", input.venueKind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data) {
    return { ok: true, data: null };
  }

  if (!normalizeVenueBookingStatus(data.status)) {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      requestId: data.id,
      status: data.status,
      createdAt: data.created_at,
    },
  };
}
