import type { SupabaseClient } from "@supabase/supabase-js";

export type AttendeeRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  qr_used_at: string | null;
  tier_name: string | null;
  purchase_time: string | null;
  order_short_id: string | null;
};

export type EventAttendees = {
  event: { id: string; name: string; status: string };
  rows: AttendeeRow[];
  total: number;
  limit: number;
  offset: number;
};

export type LoadEventAttendeesResult =
  | { status: "ok"; attendees: EventAttendees }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * SAN-982 — real attendee list for one organizer-owned event.
 *
 * Reads through `event_attendees_paginated`, which raises `NOT_ORGANIZER` for a
 * foreign event (and the explicit `organizer_id` check below resolves that to
 * 404 before the RPC runs). A failed query is reported as `error`, never as an
 * empty list, so "no attendees" and "backend failed" stay distinguishable.
 */
export async function loadEventAttendees(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  options: { search?: string; limit?: number; offset?: number } = {},
): Promise<LoadEventAttendeesResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = (options.search ?? "").trim();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, status")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError) {
    console.error("[load-event-attendees] event query failed:", eventError.message);
    return { status: "error", message: "Could not load this event. Try again." };
  }
  if (!event) return { status: "not_found" };

  const { data, error } = await supabase.rpc("event_attendees_paginated", {
    p_event_id: eventId,
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("[load-event-attendees] attendees query failed:", error.message);
    return { status: "error", message: "Could not load attendees. Try again." };
  }

  const payload = (data ?? {}) as { total?: number; rows?: AttendeeRow[] };

  return {
    status: "ok",
    attendees: {
      event: {
        id: String((event as { id: string }).id),
        name: String((event as { name: string }).name ?? "Untitled event"),
        status: String((event as { status: string }).status ?? "draft"),
      },
      rows: payload.rows ?? [],
      total: payload.total ?? 0,
      limit,
      offset,
    },
  };
}
