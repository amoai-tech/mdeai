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
  let query = client.from(cfg.table).select(cfg.fields).eq("id", input.id);
  if (input.page === "cafes" || input.page === "nightlife") {
    query = query.eq("kind", input.page === "cafes" ? "cafe" : "nightclub");
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return { found: false, data: null };
  const row = data as unknown as Record<string, unknown>;
  return {
    found: true,
    data: Object.fromEntries(cfg.fields.split(", ").filter((column) => column in row).map((column) => [column, row[column]])),
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
