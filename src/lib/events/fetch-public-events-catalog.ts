import { createClient } from "@/lib/supabase/server";
import {
  listPublishedEvents,
  type ListPublishedEventsQuery,
  type PublishedEventListItem,
} from "@/lib/events/list-published-events";

export type FetchPublicEventsCatalogQuery = Pick<
  ListPublishedEventsQuery,
  "category" | "neighborhood" | "dateWindow" | "price" | "limit" | "offset"
>;

/**
 * Render the public catalog on the server using the SAME canonical query as
 * GET /api/events/public. Do not fetch our own HTTP route: protected Vercel
 * deployment hosts redirect unauthenticated server-to-server requests to SSO.
 * The request-scoped Supabase client enforces the normal RLS/public grants.
 */
export async function fetchPublicEventsCatalog(
  query: FetchPublicEventsCatalogQuery,
): Promise<{ results: PublishedEventListItem[]; total: number; error: string | null }> {
  try {
    const supabase = await createClient();
    const { results, total, error } = await listPublishedEvents(supabase, query);
    return { results, total, error };
  } catch (error) {
    console.error("[fetch-public-events-catalog] server catalog query failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return { results: [], total: 0, error: "Could not load events. Try again in a moment." };
  }
}
