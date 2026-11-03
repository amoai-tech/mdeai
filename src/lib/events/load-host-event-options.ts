import type { SupabaseClient } from "@supabase/supabase-js";

export type HostEventOption = { id: string; name: string; status: string };

/**
 * SAN-983 / SAN-982 / SAN-984 — the organizer's events, used by the shared
 * scope picker so tickets, attendees and check-in can target one event.
 * Ordering mirrors the host list (newest start first, stable id tie-break).
 */
export async function loadHostEventOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<HostEventOption[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, status")
    .eq("organizer_id", userId)
    .order("event_start_time", { ascending: false })
    .order("id", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[load-host-event-options] query failed:", error.message);
    return [];
  }

  return ((data ?? []) as Array<{ id: string; name: string | null; status: string | null }>).map(
    (row) => ({
      id: String(row.id),
      name: row.name ?? "Untitled event",
      status: row.status ?? "draft",
    }),
  );
}

/** Pick the requested event when it belongs to the organizer, else the first. */
export function resolveSelectedEvent(
  options: readonly HostEventOption[],
  requestedId: string | null | undefined,
): HostEventOption | null {
  if (options.length === 0) return null;
  if (requestedId) {
    const match = options.find((option) => option.id === requestedId);
    if (match) return match;
  }
  return options[0];
}
