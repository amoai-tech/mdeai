/** Real order states that exist in `public.event_orders`. */
const STATUS_KEYS = ["paid", "pending", "refunded", "partial_refund", "cancelled"] as const;
export type OrderStatusKey = (typeof STATUS_KEYS)[number] | "other";

export type OrderSummaryRow = {
  status: string | null;
  total_cents: number | null;
  quantity?: number | null;
};

export type OrderStatusBucket = { count: number; tickets: number; totalCents: number };

export type EventOrderSummary = {
  buckets: Record<OrderStatusKey, OrderStatusBucket>;
  /** Paid + partially refunded = money the host actually holds. */
  revenueCents: number;
  /** Paid orders only; pending/refunded are never counted as sales. */
  ticketsSold: number;
  orderCount: number;
  /** True only when every row carried a usable status and amount. */
  complete: boolean;
};

function emptyBucket(): OrderStatusBucket {
  return { count: 0, tickets: 0, totalCents: 0 };
}

function keyFor(status: string | null | undefined): OrderStatusKey {
  const value = (status ?? "").toLowerCase();
  return (STATUS_KEYS as readonly string[]).includes(value)
    ? (value as OrderStatusKey)
    : "other";
}

/**
 * SAN-983 — summarize organizer orders from real rows only.
 *
 * Rules that keep the numbers truthful:
 *  - revenue counts `paid` + `partial_refund` (money actually collected);
 *  - tickets sold counts paid rows only, never pending holds;
 *  - an unknown status lands in `other` and never inflates revenue;
 *  - a missing amount marks the summary `complete: false` rather than adding 0.
 */
export function summarizeEventOrders(rows: readonly OrderSummaryRow[]): EventOrderSummary {
  const buckets: Record<OrderStatusKey, OrderStatusBucket> = {
    paid: emptyBucket(),
    pending: emptyBucket(),
    refunded: emptyBucket(),
    partial_refund: emptyBucket(),
    cancelled: emptyBucket(),
    other: emptyBucket(),
  };

  let complete = true;

  for (const row of rows) {
    const key = keyFor(row.status);
    const amount = row.total_cents;
    const quantity = row.quantity ?? 0;
    const bucket = buckets[key];

    bucket.count += 1;
    bucket.tickets += quantity;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      bucket.totalCents += amount;
    } else {
      complete = false;
    }
  }

  return {
    buckets,
    revenueCents: buckets.paid.totalCents + buckets.partial_refund.totalCents,
    ticketsSold: buckets.paid.tickets,
    orderCount: rows.length,
    complete,
  };
}
