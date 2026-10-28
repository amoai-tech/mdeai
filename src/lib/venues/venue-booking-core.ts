import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  venueBookingRequestSchema,
  type VenueBookingRequestInput,
  type VenueBookingSubmitResult,
} from "@/lib/venues/venue-booking-form-schema";

const SAVED_MESSAGE =
  "Request sent — we'll confirm by WhatsApp. This is not a confirmed reservation yet.";

/** The canonical MDE UUID takes precedence over an optional Google ID. */
export function buildVenueBookingIdempotencyKey(input: {
  venueKind: string;
  placeId?: string | null;
  restaurantId?: string | null;
  requestedAt: string;
  partySize: number;
}): string {
  const resourceId = input.restaurantId ?? input.placeId;
  if (!resourceId) throw new Error("Missing booking resource identity");
  const raw = `${input.venueKind}|${resourceId}|${input.requestedAt}|${input.partySize}`;
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `vb-${digest}`;
}

export async function insertVenueBookingRequest(
  supabase: SupabaseClient<Database>,
  userId: string,
  body: unknown,
): Promise<
  | { ok: true; data: VenueBookingSubmitResult }
  | { ok: false; status: number; message: string }
> {
  const parsed = venueBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, message: "Validation failed" };
  }

  const input: VenueBookingRequestInput = parsed.data;
  let restaurantId: string | null = input.restaurantId ?? null;

  if (input.venueKind === "restaurant" && restaurantId) {
    // Never accept a client-supplied UUID without resolving a real MDE record.
    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("id, google_place_id")
      .eq("id", restaurantId)
      .maybeSingle();
    if (error) {
      return { ok: false, status: 500, message: "Could not verify restaurant" };
    }
    if (!restaurant) {
      return { ok: false, status: 404, message: "Restaurant not found" };
    }
    if (
      input.placeId &&
      restaurant.google_place_id !== input.placeId
    ) {
      return { ok: false, status: 400, message: "Restaurant and Google Place ID do not match" };
    }
  } else if (input.venueKind === "restaurant" && input.placeId) {
    // An external Google place can still be requested; link an existing MDE
    // restaurant when the Place ID matches one stored in the canonical table.
    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("id")
      .eq("google_place_id", input.placeId)
      .maybeSingle();
    if (error) {
      return { ok: false, status: 500, message: "Could not resolve restaurant" };
    }
    restaurantId = restaurant?.id ?? null;
  }

  const idempotencyKey =
    input.idempotencyKey ??
    buildVenueBookingIdempotencyKey({
      venueKind: input.venueKind,
      placeId: input.placeId,
      restaurantId,
      requestedAt: input.requestedAt,
      partySize: input.partySize,
    });

  const metadata: Json = input.venueTitle
    ? { venue_title: input.venueTitle }
    : {};

  const { data, error } = await supabase
    .from("venue_booking_requests")
    .insert({
      user_id: userId,
      venue_kind: input.venueKind,
      place_id: input.placeId ?? null,
      restaurant_id: restaurantId,
      party_size: input.partySize,
      requested_at: input.requestedAt,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone ?? null,
      notes: input.notes ?? null,
      status: "pending",
      source: "web",
      idempotency_key: idempotencyKey,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // A successful first request can be followed by a lost response. Return
      // the persisted receipt, but only if the conflicting row is this request.
      const { data: previous, error: lookupError } = await supabase
        .from("venue_booking_requests")
        .select("id, venue_kind, place_id, restaurant_id, requested_at, party_size")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (
        !lookupError && previous &&
        previous.venue_kind === input.venueKind &&
        previous.place_id === (input.placeId ?? null) &&
        previous.restaurant_id === restaurantId &&
        previous.party_size === input.partySize &&
        new Date(previous.requested_at).getTime() === new Date(input.requestedAt).getTime()
      ) {
        return { ok: true, data: { requestId: previous.id, message: SAVED_MESSAGE } };
      }
      return { ok: false, status: 409, message: "You already submitted a different booking request." };
    }
    return { ok: false, status: 500, message: "Could not save booking request" };
  }

  return { ok: true, data: { requestId: data.id, message: SAVED_MESSAGE } };
}
