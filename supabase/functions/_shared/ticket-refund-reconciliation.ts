// Stripe money is in minor units. A partial refund does not itself revoke admission.
// Pure contract kept separate so malformed provider records cannot reach the money RPC.
export interface StripeRefundEvidence {
  id: string;
  amount: number;
  status: string | null;
  charge: string | { id: string } | null;
  reason?: string | null;
  created: number;
}
export interface StripeChargeEvidence {
  id: string;
  amount: number;
  currency: string;
}
// Stripe list calls yield an async iterator that transparently fetches all pages.
// Never commit a partial money snapshot: exceed the safety cap => retry/fail closed.
export async function collectStripeRefunds<T>(
  source: AsyncIterable<T>,
  maxRefunds = 1_000,
): Promise<T[]> {
  const refunds: T[] = [];
  for await (const refund of source) {
    if (refunds.length >= maxRefunds) {
      throw new Error("REFUND_RECONCILIATION_LIMIT");
    }
    refunds.push(refund);
  }
  return refunds;
}

export function validatedSuccessfulRefunds(
  charge: StripeChargeEvidence,
  order: { total_cents: number; currency: string },
  refunds: StripeRefundEvidence[],
  hasMore: boolean,
): StripeRefundEvidence[] {
  if (hasMore) throw new Error("REFUND_PAGE_INCOMPLETE");
  if (
    !Number.isSafeInteger(charge.amount) ||
    charge.amount <= 0 ||
    charge.amount !== Number(order.total_cents) ||
    charge.currency.toLowerCase() !== order.currency.toLowerCase()
  ) {
    throw new Error("REFUND_CHARGE_ORDER_MISMATCH");
  }
  const successes = refunds.filter((r) => r.status === "succeeded");
  let total = 0;
  for (const refund of successes) {
    const chargeId = typeof refund.charge === "string"
      ? refund.charge
      : refund.charge?.id;
    if (
      chargeId !== charge.id ||
      !/^re_[a-zA-Z0-9]+$/.test(refund.id) ||
      !Number.isSafeInteger(refund.amount) ||
      refund.amount <= 0
    ) {
      throw new Error("REFUND_INVALID_PROVIDER_EVIDENCE");
    }
    total += refund.amount;
    if (total > charge.amount) throw new Error("REFUND_EXCEEDS_CHARGE");
  }
  return successes.sort((a, b) =>
    a.created - b.created || a.id.localeCompare(b.id)
  );
}
export function stripeRefundReason(reason?: string | null) {
  return reason === "duplicate" || reason === "fraudulent"
    ? reason
    : reason === "requested_by_customer"
    ? "customer_request"
    : "other";
}
