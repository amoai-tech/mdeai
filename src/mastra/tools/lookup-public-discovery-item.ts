import { createTool } from "@mastra/core/tools";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";

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
  const isUuid = /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.id);
  const lookupColumn = venuePage && !isUuid ? "google_place_id" : "id";
  let query = client.from(cfg.table).select(cfg.fields).eq(lookupColumn, input.id);
  if (input.page === "cafes" || input.page === "nightlife") {
    query = query.eq("kind", input.page === "cafes" ? "cafe" : "nightclub");
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return { found: false, data: null };
  const row = data as unknown as Record<string, unknown>;
  return {
    found: true,
    // Project by iterating returned entries, not indexing a record with dynamic keys.
    data: Object.fromEntries(Object.entries(row).filter(([column]) =>
      cfg.fields.split(", ").includes(column))),
  };
}

export const lookupPublicDiscoveryItemTool = createTool({
  id: "lookup-public-discovery-item",
  description: "Verify a currently selected public apartment, restaurant, event, café or nightlife record by ID through server-side Supabase RLS. Only use returned fields; an ID supplied by the browser proves nothing.",
  inputSchema,
  outputSchema: z.object({
    found: z.boolean(),
    data: z.record(z.string(), z.unknown()).nullable(),
  }),
  execute: async (input) => {
    const env = getSupabaseServerAnonEnv();
    if (!env) return { found: false, data: null };
    const client = createClient(env.url, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return lookupPublicDiscoveryItem(input, client);
  },
});
