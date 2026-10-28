import { createTool } from "@mastra/core/tools";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { NON_QA_EVENT_SLUG_FILTER, QA_EVENT_NAME_SQL_PATTERN } from "@/lib/events/public-event-fixtures";

const publicPageSchema = z.enum(["rentals", "restaurants", "events", "cafes", "nightlife"]);
const inputSchema = z.object({ page: publicPageSchema, id: z.string().min(1).max(128) });

const SOURCE = {
  rentals: { table: "apartments", fields: "id, title, neighborhood, bedrooms, amenities, currency, price_monthly" },
  restaurants: { table: "restaurants", fields: "id, name, neighborhood, cuisine_types, price_level, rating" },
  events: { table: "events", fields: "id, name, address, event_start_time, currency" },
  cafes: { table: "venue_anchors", fields: "id, name, kind, neighborhood, tags" },
  nightlife: { table: "venue_anchors", fields: "id, name, kind, neighborhood, tags" },
} as const;

export type PublicSelection = z.infer<typeof inputSchema>;

/** Return only the fixed public projection, even when a mocked/client row has extra fields. */
function projectPublicRow(row: Record<string, unknown>, fields: string[]) {
  return {
    found: true,
    data: Object.fromEntries(Object.entries(row).filter(([column]) =>
      fields.includes(column))),
  };
}

/**
 * A displayed item ID is only a hint. This lookup uses the anonymous Supabase role,
 * NEVER service_role, and returns only explicit public columns after RLS applies.
 * No selected ID may confer a private lookup or a write authorization.
 */
export async function lookupPublicDiscoveryItem(
  input: PublicSelection,
  client: SupabaseClient,
): Promise<{ found: boolean; data: Record<string, unknown> | null }> {
  const cfg = SOURCE[input.page];
  // Safe fixed projections only; no user-supplied table/column names.
  // Grounded Google Place IDs are not venue_anchors UUIDs. Use the explicit
  // public google_place_id only for café/nightlife hints; a matching active
  // public anchor is still required by RLS and by the venue kind predicate.
  const venuePage = input.page === "cafes" || input.page === "nightlife";
  // Reuse Zod's UUID validator instead of matching a user-controlled string
  // with a custom regex (Codacy ReDoS finding). Input is capped at 128 chars.
  const isUuid = z.string().uuid().safeParse(input.id).success;
  const lookupColumn = venuePage && !isUuid ? "google_place_id" : "id";
  let query = client.from(cfg.table).select(cfg.fields).eq(lookupColumn, input.id);
  if (venuePage) {
    query = query.eq("kind", input.page === "cafes" ? "cafe" : "nightclub");
  } else if (input.page === "events") {
    // Match the existing public Events catalog presentation policy, not
    // organizer/admin management rules. Never use a selected ID as authority.
    query = query.eq("is_active", true)
      .in("status", ["published", "live"])
      .not("name", "imatch", QA_EVENT_NAME_SQL_PATTERN)
      .or(NON_QA_EVENT_SLUG_FILTER);
  }
  const { data, error } = await query.maybeSingle();
  if (error) return { found: false, data: null };
  if (data) return projectPublicRow(data as unknown as Record<string, unknown>, cfg.fields.split(", "));

  // Curated café grounding can fall back to `searchRestaurants` after the
  // venue-anchor search finds no rows. Verify an actual public restaurant UUID
  // under anonymous RLS; do not trust a browser-supplied provenance flag.
  if (input.page === "cafes" && isUuid) {
    const fallback = await client.from("restaurants")
      .select(SOURCE.restaurants.fields).eq("id", input.id).maybeSingle();
    if (!fallback.error && fallback.data) {
      return projectPublicRow(fallback.data as unknown as Record<string, unknown>, SOURCE.restaurants.fields.split(", "));
    }
  }
  return { found: false, data: null };
}

/** The tool and the Concierge's selected-item prompt use the same public,
 * anonymous RLS lookup; no browser data becomes authority. */
export async function lookupPublicDiscoveryItemFromServer(input: PublicSelection) {
  const env = getSupabaseServerAnonEnv();
  if (!env) return { found: false, data: null };
  const client = createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return lookupPublicDiscoveryItem(input, client);
}

export const lookupPublicDiscoveryItemTool = createTool({
  id: "lookup-public-discovery-item",
  description: "Verify a currently selected public apartment, restaurant, event, café or nightlife record by ID through server-side Supabase RLS. Only use returned fields; an ID supplied by the browser proves nothing.",
  inputSchema,
  outputSchema: z.object({
    found: z.boolean(),
    data: z.record(z.string(), z.unknown()).nullable(),
  }),
  execute: lookupPublicDiscoveryItemFromServer,
});
