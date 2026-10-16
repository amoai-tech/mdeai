/**
 * Fetch one canonical restaurant by id for the detail + vote screen (SAN-1469).
 *
 * Uses the server anon client so phase-aware RLS on public.restaurants decides
 * visibility (development shows inactive/unverified rows; launch shows active only).
 * Reuses the exact row -> Restaurant mapping from the search tool so the detail card
 * and the directory card can never disagree.
 */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { rowToRestaurant, type Restaurant, type RestaurantRow } from "@/mastra/tools/search-restaurants";

const SELECT_FIELDS =
  "id, name, cuisine_types, price_level, address, city, neighborhood, latitude, longitude, primary_image_url, rating, tags, google_place_id, maps_url, ai_summary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A lookup result must distinguish "this restaurant does not exist" from "the catalog
 * could not be reached": showing a 404 during an outage tells the visitor the wrong story.
 */
export type RestaurantLookup =
  | { status: "found"; restaurant: Restaurant }
  | { status: "not_found" }
  | { status: "error" };

export async function fetchRestaurantById(id: string): Promise<RestaurantLookup> {
  // A non-uuid (legacy slug, typo) is a clean miss, not a PostgREST error.
  if (!UUID_RE.test(id)) return { status: "not_found" };

  const env = getSupabaseServerAnonEnv();
  if (!env) return { status: "error" };

  const client = createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client
    .from("restaurants")
    .select(SELECT_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error) return { status: "error" };
  if (!data) return { status: "not_found" };
  return { status: "found", restaurant: rowToRestaurant(data as unknown as RestaurantRow) };
}