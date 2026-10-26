import type { SupabaseClient } from "@supabase/supabase-js";

/** Columns the manual editor reads for the organizer's own event. */
const EVENT_DETAIL_SELECT =
  "id, name, description, status, event_start_time, event_end_time, address, city, event_type, slug, organizer_id, updated_at, primary_image_url, ticket_price_min, currency";

export type HostEventTier = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  qty_total: number;
  qty_sold: number;
  qty_pending: number;
  is_active: boolean;
};

export type HostEventDetail = {
  event: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    eventStartTime: string;
    eventEndTime: string | null;
    address: string | null;
    city: string | null;
    eventType: string | null;
    slug: string | null;
    updatedAt: string;
    imageUrl: string | null;
    ticketPriceMin: number | null;
    currency: string | null;
  };
  tiers: HostEventTier[];
  summary: EventDashboardSummary | null;
};

export type EventDashboardSummary = {
  kpis?: { tickets_sold?: number; checked_in?: number; no_shows?: number };
  revenue_cents?: number;
  tiers?: Array<{
    id?: string;
    name?: string;
    price_cents?: number;
    qty_total?: number;
    qty_sold?: number;
    qty_pending?: number;
  }>;
};

export type LoadHostEventResult =
  | { status: "ok"; detail: HostEventDetail }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * SAN-885 — load exactly one organizer-owned event plus its real tiers and
 * order/check-in summary. Authorization is explicit here (`organizer_id`) and
 * additionally enforced by `events_organizer_select_own` RLS, so a foreign id
 * resolves to `not_found` rather than leaking existence.
 */
export async function loadHostEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<LoadHostEventResult> {
  const { data: event, error } = await supabase
    .from("events")
    .select(EVENT_DETAIL_SELECT)
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[load-host-event] events query failed:", error.message);
    return { status: "error", message: "Could not load this event. Try again." };
  }
  if (!event) return { status: "not_found" };

  const { data: tiers, error: tiersError } = await supabase
    .from("event_tickets")
    .select("id, name, price_cents, currency, qty_total, qty_sold, qty_pending, is_active")
    .eq("event_id", eventId)
    .order("price_cents", { ascending: true });

  if (tiersError) {
    console.error("[load-host-event] tiers query failed:", tiersError.message);
    return { status: "error", message: "Could not load ticket tiers. Try again." };
  }

  const { data: summary, error: summaryError } = await supabase.rpc(
    "event_dashboard_summary",
    { p_event_id: eventId },
  );

  if (summaryError) {
    // KPIs are supporting information: keep the editor usable, report honestly.
    console.error("[load-host-event] dashboard summary failed:", summaryError.message);
  }

  const row = event as Record<string, unknown>;
  return {
    status: "ok",
    detail: {
      event: {
        id: String(row.id),
        name: String(row.name ?? "Untitled event"),
        description: (row.description as string | null) ?? null,
        status: String(row.status ?? "draft"),
        eventStartTime: String(row.event_start_time),
        eventEndTime: (row.event_end_time as string | null) ?? null,
        address: (row.address as string | null) ?? null,
        city: (row.city as string | null) ?? null,
        eventType: (row.event_type as string | null) ?? null,
        slug: (row.slug as string | null) ?? null,
        updatedAt: String(row.updated_at),
        imageUrl: (row.primary_image_url as string | null) ?? null,
        ticketPriceMin:
          row.ticket_price_min == null ? null : Number(row.ticket_price_min),
        currency: (row.currency as string | null) ?? null,
      },
      tiers: ((tiers ?? []) as HostEventTier[]).map((tier) => ({
        ...tier,
        price_cents: Number(tier.price_cents),
      })),
      summary: (summary as EventDashboardSummary | null) ?? null,
    },
  };
}
