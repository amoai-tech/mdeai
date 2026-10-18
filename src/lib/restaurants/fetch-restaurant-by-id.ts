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
import { createServiceRoleClient } from "@/lib/supabase/service";
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

/**
 * Resolve the contest + entry a restaurant is contesting in (SAN-1483).
 *
 * Server-only: public.vote_restaurant_target is granted to service_role alone, so this
 * never runs in the browser and vote.* stays private. Returns null when the restaurant is
 * not linked to a votable contest or its contest is ambiguous without an explicit ID.
 */
export async function fetchRestaurantVoteTarget(
  restaurantId: string,
  contestId: string | null = null,
): Promise<{ contestId: string; entityId: string } | null> {
  // An invalid or forged contest selection must never fall back to another
  // contest's ballot. The existing service-role-only RPC validates the pair.
  if (!UUID_RE.test(restaurantId) || (contestId !== null && !UUID_RE.test(contestId))) return null;
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const args = contestId
    ? { p_restaurant_id: restaurantId, p_contest_id: contestId }
    : { p_restaurant_id: restaurantId };
  const { data, error } = await supabase.rpc("vote_restaurant_target", args);
  if (error) {
    // Never silently hide a broken lookup: operators need the signal, the page still renders.
    console.error("[restaurant] vote_restaurant_target failed:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as { contest_id?: string; entity_id?: string };
  if (!row.contest_id || !row.entity_id) return null;
  return { contestId: row.contest_id, entityId: row.entity_id };
}