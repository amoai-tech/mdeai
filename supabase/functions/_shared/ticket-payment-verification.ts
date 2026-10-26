/** Compare authenticated Stripe evidence against the server-priced pending order. */
export interface PaidOrderSnapshot {
  id: string;
  total_cents: number;
  currency: string;
  status: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
}
export interface StripePaymentEvidence {
  amount: number | null;
  currency: string | null;
  paymentIntentId: string;
  sessionId?: string;
}

export function assertPaidOrderMatches(
  order: PaidOrderSnapshot | null,
  evidence: StripePaymentEvidence,
): void {
  if (!order) throw new Error("PAYMENT_ORDER_NOT_FOUND");
  if (order.status !== "pending" && order.status !== "paid") {
    throw new Error("PAYMENT_ORDER_BAD_STATE");
  }
  if (!Number.isSafeInteger(evidence.amount) || (evidence.amount ?? 0) <= 0 ||
      !Number.isSafeInteger(order.total_cents) || order.total_cents <= 0 ||
      evidence.amount !== order.total_cents) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }
  if (!evidence.currency || !order.currency ||
      evidence.currency.toLowerCase() !== "cop" ||
      order.currency.toLowerCase() !== evidence.currency.toLowerCase()) {
    throw new Error("PAYMENT_CURRENCY_MISMATCH");
  }
  if (order.stripe_session_id && evidence.sessionId &&
      order.stripe_session_id !== evidence.sessionId) {
    throw new Error("PAYMENT_SESSION_MISMATCH");
  }
  if (order.status === "paid" &&
      order.stripe_payment_intent !== evidence.paymentIntentId) {
    throw new Error("PAYMENT_INTENT_MISMATCH");
  }
}