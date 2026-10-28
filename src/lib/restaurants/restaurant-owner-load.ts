import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * SAN-1540 — reads for the partner restaurant workspace.
 *
 * These loaders run with the signed-in user's Supabase client, so RLS is the
 * database boundary. The page still re-checks membership + assignment before it
 * renders an editor: a URL is a selector, never an authorization.
 */

export const OWNER_RESTAURANT_FIELDS =
  "id, name, description, website, phone, email, address, neighborhood, city, postal_code, hours_of_operation, price_level, cuisine_types, dietary_options, ambiance, tags, images, primary_image_url, is_active, partner_id, google_place_id, updated_at";

export type OwnerRestaurantRow = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  postal_code: string | null;
  hours_of_operation: unknown;
  price_level: number | null;
  cuisine_types: string[] | null;
  dietary_options: string[] | null;
  ambiance: string[] | null;
  tags: string[] | null;
  images: unknown;
  primary_image_url: string | null;
  is_active: boolean;
  partner_id: string | null;
  google_place_id: string | null;
  updated_at: string;
};

export type OwnerRestaurantListItem = Pick<
  OwnerRestaurantRow,
  "id" | "name" | "address" | "neighborhood" | "city" | "is_active" | "primary_image_url" | "updated_at"
>;

export type MenuItemRow = {
  id: string;
  restaurant_id: string;
  section: string | null;
  name: string;
  description: string | null;
  price_amount: number | null;
  currency: string;
  position: number;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ReservationRequestRow = {
  id: string;
  party_size: number | null;
  requested_at: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  notes: string | null;
  status: string;
  source: string;
  created_at: string;
};

export type RestaurantLoad<T> =
  | { status: "loaded"; data: T }
  | { status: "not_found" }
  | { status: "error" };

/** List reads have no single-row "not found" state. */
export type RestaurantListLoad<T> = { status: "loaded"; data: T } | { status: "error" };

const LIST_FIELDS =
  "id, name, address, neighborhood, city, is_active, primary_image_url, updated_at";

/**
 * Pure authorization decision, unit-tested without a database.
 *
 * An admin may open any restaurant. A partner member may open only a restaurant
 * whose stored `partner_id` is one of their authorized partner ids. The Google
 * Place ID never participates: it is client-editable.
 */
export function canAccessOwnerRestaurant(input: {
  partnerId: string | null;
  authorizedPartnerIds: string[];
  isAdmin: boolean;
}): boolean {
  if (input.isAdmin) return true;
  if (!input.partnerId) return false;
  return input.authorizedPartnerIds.includes(input.partnerId);
}

export async function isAdminUser(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("[restaurants] is_admin failed", error.message);
    return false;
  }
  return data === true;
}

export async function loadPartnerRestaurants(
  supabase: SupabaseClient<Database>,
  partnerId: string,
): Promise<RestaurantListLoad<OwnerRestaurantListItem[]>> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(LIST_FIELDS)
    .eq("partner_id", partnerId)
    .order("name", { ascending: true });

  if (error) {
    console.error("[restaurants] partner list failed", error.message);
    return { status: "error" };
  }
  return { status: "loaded", data: data ?? [] };
}

/** Admin-only view: records still waiting for a partner assignment. */
export async function loadUnassignedRestaurants(
  supabase: SupabaseClient<Database>,
): Promise<RestaurantListLoad<OwnerRestaurantListItem[]>> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(LIST_FIELDS)
    .is("partner_id", null)
    .order("name", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[restaurants] unassigned list failed", error.message);
    return { status: "error" };
  }
  return { status: "loaded", data: data ?? [] };
}

export async function loadOwnerRestaurant(
  supabase: SupabaseClient<Database>,
  restaurantId: string,
): Promise<RestaurantLoad<OwnerRestaurantRow>> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(OWNER_RESTAURANT_FIELDS)
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) {
    console.error("[restaurants] owner restaurant read failed", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "not_found" };
  return { status: "loaded", data: data as unknown as OwnerRestaurantRow };
}

export async function loadRestaurantMenuItems(
  supabase: SupabaseClient<Database>,
  restaurantId: string,
): Promise<RestaurantListLoad<MenuItemRow[]>> {
  const { data, error } = await supabase
    .from("restaurant_menu_items")
    .select(
      "id, restaurant_id, section, name, description, price_amount, currency, position, source_url, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("section", { ascending: true, nullsFirst: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[restaurants] menu read failed", error.message);
    return { status: "error" };
  }
  return { status: "loaded", data: (data ?? []) as unknown as MenuItemRow[] };
}

export async function loadRestaurantReservationRequests(
  supabase: SupabaseClient<Database>,
  restaurantId: string,
): Promise<RestaurantListLoad<ReservationRequestRow[]>> {
  const { data, error } = await supabase
    .from("venue_booking_requests")
    .select(
      "id, party_size, requested_at, contact_name, contact_email, contact_phone, notes, status, source, created_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[restaurants] reservation inbox read failed", error.message);
    return { status: "error" };
  }
  return { status: "loaded", data: (data ?? []) as unknown as ReservationRequestRow[] };
}

/** Partner options for the admin assignment control (id + display name only). */
export async function loadAssignablePartners(
  supabase: SupabaseClient<Database>,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("partners")
    .select("id, settings")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[restaurants] partner options failed", error.message);
    return [];
  }
  return (data ?? []).map((partner) => {
    const settings = (partner.settings ?? {}) as Record<string, unknown>;
    const name =
      typeof settings.businessName === "string" && settings.businessName.trim()
        ? settings.businessName.trim()
        : "Partner";
    return { id: partner.id, name };
  });
}
