/**
 * Fetch one canonical restaurant by id for the detail + vote screen (SAN-1469).
 *
 * Uses the server anon client so phase-aware RLS on public.restaurants decides
 * visibility (development shows inactive/unverified rows; launch shows active only).
 * Reuses the exact row -> Restaurant mapping from the search tool so the detail card
 * and the directory card can never disagree.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { rowToRestaurant, type Restaurant, type RestaurantRow } from "@/mastra/tools/search-restaurants";

const SELECT_FIELDS =
  "id, name, cuisine_types, price_level, address, city, neighborhood, latitude, longitude, primary_image_url, rating, tags, google_place_id, maps_url, ai_summary";

/**
 * UUID shape check for route and query values the visitor controls.
 *
 * Deliberately not a regular expression. The pattern would be anchored and
 * fixed-length, but a regex applied to user-supplied input is a static-analysis
 * ReDoS sink, so every future review has to re-prove the same negative. Reuse the
 * validator the vote endpoints already enforce instead: one definition at every
 * trust boundary, and a single anchored pass that stays linear on hostile input.
 */
const uuidSchema = z.string().uuid();

function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

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
  if (!isUuid(id)) return { status: "not_found" };

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
  if (!isUuid(restaurantId) || (contestId !== null && !isUuid(contestId))) return null;
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

  // The RPC returns jsonb, so treat its shape as untrusted until proven otherwise.
  const row = data as { contest_id?: unknown; entity_id?: unknown };
  if (typeof row.contest_id !== "string" || typeof row.entity_id !== "string") return null;
  if (!isUuid(row.contest_id) || !isUuid(row.entity_id)) return null;
  // Defence in depth: the RPC already filters by contest, but the application must never
  // hand back a target from a different contest than the one the visitor selected.
  // UUIDs compare case-insensitively because callers may supply upper-case input.
  if (contestId !== null && row.contest_id.toLowerCase() !== contestId.toLowerCase()) return null;
  return { contestId: row.contest_id, entityId: row.entity_id };
  
}

export type RestaurantContestOption = {
  contestId: string;
  entityId: string;
  contestTitle: string;
  status: string;
};

/**
 * Every contest this restaurant can be voted in (SAN-1524).
 *
 * vote_restaurant_target refuses to pick a contest for the visitor. Refusing is right, but a
 * blank panel is not: this read lets the page ASK. Same eligibility filter and the same
 * service-role-only grant, so `vote` stays private.
 */
export async function fetchRestaurantContestOptions(
  restaurantId: string,
): Promise<RestaurantContestOption[]> {
  if (!UUID_RE.test(restaurantId)) return [];
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("vote_restaurant_contest_options", {
    p_restaurant_id: restaurantId,
  });
  if (error) {
    console.error("[restaurant] vote_restaurant_contest_options failed:", error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];

  const options: RestaurantContestOption[] = [];
  for (const raw of data) {
    const row = raw as { contest_id?: string; entity_id?: string; contest_title?: string; status?: string };
    if (!row.contest_id || !row.entity_id) continue;
    if (!UUID_RE.test(row.contest_id) || !UUID_RE.test(row.entity_id)) continue;
    options.push({
      contestId: row.contest_id,
      entityId: row.entity_id,
      contestTitle: row.contest_title ?? "Contest",
      status: row.status ?? "unknown",
    });
  }
  return options;
}