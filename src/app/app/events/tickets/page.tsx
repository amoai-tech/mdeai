import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventScopePicker } from "@/components/host/event-scope-picker";
import { getServerUser } from "@/lib/auth/session";
import { formatMoney } from "@/lib/events/format-money";
import { loadEventCommerce } from "@/lib/events/load-event-commerce";
import { loadHostEventOptions } from "@/lib/events/load-host-event-options";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tickets · mdeai" };

const STATUS_LABEL = new Map<string, string>(Object.entries({
  paid: "Paid",
  pending: "Pending",
  refunded: "Refunded",
  partial_refund: "Partially refunded",
  cancelled: "Cancelled",
  other: "Unknown",
}));

type PageProps = {
  searchParams: Promise<{ event?: string }>;
};

/**
 * SAN-983 — organizer ticket and order management under the canonical workspace.
 *
 * Every number on this page is derived from real `event_orders` rows (see
 * `summarizeEventOrders`); pending holds are shown but never counted as revenue
 * or as sold tickets. A query failure renders an error, never a fake zero.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventTicketsPage({ searchParams }: PageProps) {
  const { event: requestedEvent } = await searchParams;
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/events/tickets");

  const supabase = await createClient();
  const options = await loadHostEventOptions(supabase, user.id);

  if (requestedEvent && !options.some((option) => option.id === requestedEvent)) {
    // Foreign or stale id: do not fall back to another event's sales.
    notFound();
  }

  if (options.length === 0) {
    return (
      <section className="space-y-4" data-testid="host-tickets-empty">
        <h1 className="font-serif text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-muted-foreground">
          You have no events yet, so there are no ticket sales to show.
        </p>
        <Link href="/app/events/new" className="text-sm text-primary hover:underline">
          Create an event
        </Link>
      </section>
    );
  }

  const selectedId = requestedEvent ?? options[0].id;
  const result = await loadEventCommerce(supabase, user.id, selectedId);

  if (result.status === "not_found") notFound();

  if (result.status === "error") {
    return (
      <section className="space-y-3" data-testid="host-tickets-error">
        <h1 className="font-serif text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-destructive">{result.message}</p>
        <Link href={`/app/events/tickets?event=${selectedId}`} className="text-sm text-primary hover:underline">
          Try again
        </Link>
      </section>
    );
  }

  const { commerce } = result;
  const { summary, tiers, orders } = commerce;
  const currency = orders[0]?.currency ?? tiers[0]?.currency ?? "COP";

  return (
    <section className="space-y-6" data-testid="host-tickets">
      <header className="space-y-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold">Tickets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real orders for {commerce.event.name}. Pending holds are not revenue.
          </p>
        </div>
        <EventScopePicker
          options={options}
          selectedId={commerce.event.id}
          basePath="/app/events/tickets"
          testId="host-tickets-event-picker"
        />
      </header>

      {!summary.complete ? (
        <p role="status" data-testid="host-tickets-incomplete" className="text-sm text-amber-700">
          Totals are unavailable because some order amounts are missing or the recent-order
          limit was reached. Review the actual orders; do not treat this as total revenue.
        </p>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">Revenue (paid)</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid="tickets-kpi-revenue">
            {summary.complete ? formatMoney(summary.revenueCents, currency) : "—"}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">Tickets sold</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid="tickets-kpi-sold">
            {summary.complete ? summary.ticketsSold : "—"}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">Orders</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid="tickets-kpi-orders">
            {summary.complete ? summary.orderCount : "—"}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">Checked in</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid="tickets-kpi-checked-in">
            {commerce.kpis?.checkedIn ?? "—"}
          </dd>
        </div>
      </dl>

      <section className="space-y-2" data-testid="host-tickets-tiers">
        <h2 className="font-serif text-lg font-semibold">Inventory</h2>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ticket tiers exist, so this event cannot be purchased.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Sold</th>
                  <th className="py-2 pr-3">Held</th>
                  <th className="py-2">Capacity</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{tier.name}</td>
                    <td className="py-2 pr-3">{formatMoney(tier.price_cents, tier.currency)}</td>
                    <td className="py-2 pr-3">{tier.qty_sold}</td>
                    <td className="py-2 pr-3">{tier.qty_pending}</td>
                    <td className="py-2">{tier.qty_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2" data-testid="host-tickets-orders">
        <h2 className="font-serif text-lg font-semibold">Recent orders</h2>
        <p className="text-sm text-muted-foreground">
          {Object.entries(summary.buckets)
            .filter(([, bucket]) => bucket.count > 0)
            .map(([key, bucket]) => `${STATUS_LABEL.get(key) ?? "Unknown"}: ${bucket.count}`)
            .join(" · ") || "No orders yet."}
        </p>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No orders for this event yet. This is an empty result, not an error.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Buyer</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{order.short_id}</td>
                    <td className="py-2 pr-3">{order.buyer_name ?? "—"}</td>
                    <td className="py-2 pr-3" data-order-status={order.status}>
                      {STATUS_LABEL.get((order.status ?? "").toLowerCase()) ?? (order.status || "Unknown")}
                    </td>
                    <td className="py-2 pr-3">{order.quantity}</td>
                    <td className="py-2 pr-3">{order.total_cents == null ? "—" : formatMoney(order.total_cents, order.currency)}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("en-US", {
                        timeZone: "America/Bogota",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
