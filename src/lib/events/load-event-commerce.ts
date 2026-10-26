import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeEventOrders,
  type EventOrderSummary,
} from "./event-orders-summary";
import type { HostEventTier } from "./load-host-event";

export type EventOrderRow = {
  id: string;
  short_id: string;
  status: string;
  total_cents: number;
  currency: string;
  quantity: number;
  created_at: string;
  buyer_name: string | null;
  buyer_email: string | null;
};

export type EventCommerce = {
  event: { id: string; name: string; status: string };
  tiers: HostEventTier[];
  orders: EventOrderRow[];
  summary: EventOrderSummary;
  /** Subscribed counts from the canonical dashboard RPC, when it answered. */
  kpis: { ticketsSold: number; checkedIn: number } | null;
};

export type LoadEventCommerceResult =
  | { status: "ok"; commerce: EventCommerce }
  | { status: "not_found" }
  | { status: "error"; message: string };

const ORDER_LIMIT = 200;

/**
 * SAN-983 — organizer-scoped ticket/order read surface.
 *
 * Authorization: the explicit `organizer_id` filter plus `events_organizer_*`
 * RLS. A foreign event id resolves to `not_found`, never to another host's
 * sales data. Totals come from the rows themselves (`summarizeEventOrders`),
 * never from a fabricated constant.
 */
export async function loadEventCommerce(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<LoadEventCommerceResult> {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, status")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError) {
    console.error("[load-event-commerce] event query failed:", eventError.message);
    return { status: "error", message: "Could not load this event. Try again." };
  }
  if (!event) return { status: "not_found" };

  const { data: tiers, error: tiersError } = await supabase
    .from("event_tickets")
    .select("id, name, price_cents, currency, qty_total, qty_sold, qty_pending, is_active")
    .eq("event_id", eventId)
    .order("price_cents", { ascending: true });

  if (tiersError) {
    console.error("[load-event-commerce] tiers query failed:", tiersError.message);
    return { status: "error", message: "Could not load ticket tiers. Try again." };
  }

  const { data: orders, error: ordersError } = await supabase
    .from("event_orders")
    .select(
      "id, short_id, status, total_cents, currency, quantity, created_at, buyer_name, buyer_email",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(ORDER_LIMIT);

  if (ordersError) {
    console.error("[load-event-commerce] orders query failed:", ordersError.message);
    return { status: "error", message: "Could not load orders. Try again." };
  }

  const { data: dashboard } = await supabase.rpc("event_dashboard_summary", {
    p_event_id: eventId,
  });

  const rows = ((orders ?? []) as EventOrderRow[]).map((row) => ({
    ...row,
    total_cents: Number(row.total_cents),
    quantity: Number(row.quantity),
  }));

  const kpisRaw = (dashboard as { kpis?: { tickets_sold?: number; checked_in?: number } } | null)
    ?.kpis;

  return {
    status: "ok",
    commerce: {
      event: {
        id: String((event as { id: string }).id),
        name: String((event as { name: string }).name ?? "Untitled event"),
        status: String((event as { status: string }).status ?? "draft"),
      },
      tiers: ((tiers ?? []) as HostEventTier[]).map((tier) => ({
        ...tier,
        price_cents: Number(tier.price_cents),
      })),
      orders: rows,
      summary: summarizeEventOrders(rows),
      kpis:
        kpisRaw && typeof kpisRaw.tickets_sold === "number"
          ? {
              ticketsSold: kpisRaw.tickets_sold,
              checkedIn: kpisRaw.checked_in ?? 0,
            }
          : null,
    },
  };
}
