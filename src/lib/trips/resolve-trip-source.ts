import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { TripItemType } from "./trip-item-types";

const UUID = z.string().uuid();

export type ResolvedTripSource = {
  itemType: Extract<TripItemType, "rental" | "restaurant" | "venue" | "event">;
  sourceId: string;
};

export type TripSourceResult =
  | { ok: true; source: ResolvedTripSource }
  | { ok: false; error: string };

/** Pin ids from MDE map converters are `<type>-<internal-uuid>`. */
const PREFIXED_PIN = /^(rental|restaurant|venue|event)-(.+)$/;

/**
 * Resolve a selected map pin to the internal UUID the canonical trip RPC
 * requires. Google Place IDs are never stored as trip source ids.
 */
export async function resolveTripSource(
  supabase: SupabaseClient,
  input: { pinId: string; category?: string; placeId?: string },
): Promise<TripSourceResult> {
  const prefixed = PREFIXED_PIN.exec(input.pinId);
  if (prefixed) {
    const itemType = prefixed[1] as ResolvedTripSource["itemType"];
    const parsed = UUID.safeParse(prefixed[2]);
    if (!parsed.success) {
      return { ok: false, error: "This place has no valid MDE source id." };
    }
    return { ok: true, source: { itemType, sourceId: parsed.data } };
  }

  if (input.placeId) {
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id")
      .eq("google_place_id", input.placeId)
      .maybeSingle();
    if (restaurantError) {
      return { ok: false, error: "Could not resolve this place. Try again." };
    }
    if (restaurant?.id && UUID.safeParse(restaurant.id).success) {
      return { ok: true, source: { itemType: "restaurant", sourceId: restaurant.id } };
    }

    const { data: venue, error: venueError } = await supabase
      .from("venue_anchors")
      .select("id")
      .eq("google_place_id", input.placeId)
      .maybeSingle();
    if (venueError) {
      return { ok: false, error: "Could not resolve this place. Try again." };
    }
    if (venue?.id && UUID.safeParse(venue.id).success) {
      return { ok: true, source: { itemType: "venue", sourceId: venue.id } };
    }
  }

  return {
    ok: false,
    error: "This place is not in MDE's saved place catalog yet, so it cannot be added to a trip.",
  };
}
