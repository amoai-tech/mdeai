import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { HostEventRow } from "@/lib/events/event-row-to-host-card";

/**
 * SAN-1577 — one organizer-scoped read for the legacy host list and the /app
 * Events workspace. RLS (`events_organizer_select_own`) scopes the rows; the
 * explicit organizer filter is defence-in-depth so a future public SELECT policy
 * can never widen this list.
 *
 * An error is returned as an error, never as an empty list: a database hiccup
 * must not tell an organizer they have no events.
 */
export const HOST_EVENTS_LIMIT = 50;

export type HostEventsLoadResult =
  | { ok: true; events: HostEventRow[] }
  | { ok: false; message: string };

export async function loadHostEvents(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<HostEventsLoadResult> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, name, slug, status, address, city, event_start_time, primary_image_url, ticket_price_min, ticket_url",
    )
    .eq("organizer_id", userId)
    .order("event_start_time", { ascending: false })
    .order("id", { ascending: true }) // Stable tie-breaker for matching legacy/app views.
    .limit(HOST_EVENTS_LIMIT);

  if (error) {
    console.error("[host-events] failed to load events:", error.message);
    return { ok: false, message: error.message };
  }

  return { ok: true, events: (data ?? []) as HostEventRow[] };
}
