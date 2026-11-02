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
  sessionId: string;
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
  // A signed PaymentIntent alone is not evidence that it belongs to this
  // checkout. Missing persistence is a retryable webhook race, never a bypass.
  if (!order.stripe_session_id || !evidence.sessionId) {
    throw new Error("PAYMENT_SESSION_NOT_READY");
  }
  if (order.stripe_session_id !== evidence.sessionId) {
    throw new Error("PAYMENT_SESSION_MISMATCH");
  }
  if (order.status === "paid" &&
      order.stripe_payment_intent !== evidence.paymentIntentId) {
    throw new Error("PAYMENT_INTENT_MISMATCH");
  }
}
/** Verify the stored Stripe Checkout Session, not merely PI metadata.order_id. */
export function assertCheckoutSessionBindsPayment(
  session: {
    id: string;
    metadata: { [key: string]: string } | null;
    payment_intent: string | { id: string } | null;
    payment_status: string;
    amount_total: number | null;
    currency: string | null;
  },
  expected: {
    sessionId: string;
    orderId: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
  },
): void {
  const sessionPi = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  if (session.id !== expected.sessionId ||
      session.metadata?.order_id !== expected.orderId ||
      sessionPi !== expected.paymentIntentId) {
    throw new Error("PAYMENT_SESSION_MISMATCH");
  }
  if (session.payment_status !== "paid") {
    throw new Error("PAYMENT_SESSION_NOT_PAID");
  }
  if (session.amount_total !== expected.amount ||
      session.currency?.toLowerCase() !== expected.currency.toLowerCase()) {
    throw new Error("PAYMENT_SESSION_AMOUNT_MISMATCH");
  }
}
