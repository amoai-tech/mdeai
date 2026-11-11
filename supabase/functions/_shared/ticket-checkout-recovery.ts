// Stripe v1 idempotent creates may have an ambiguous outcome after a
// dropped network response. Never release a reservation unless Stripe
// definitively rejected Session creation.
export function definitiveStripeCreateFailure(
  error: unknown,
): boolean {
  if (typeof error !== "object" || error === null) return false;
  const kind = error as { type?: string; code?: string };
  // Stripe returns an idempotency error when the SAME key was already used
  // with DIFFERENT parameters. That can only happen because an earlier attempt
  // reached Stripe - so the Session may already exist and may already be
  // payable. Releasing the reservation here would take money for an order we
  // just cancelled. Treat it as uncertain: hold the tickets, fail closed, and
  // let the caller reconcile. Do not "optimise" this into a cancellation.
  if (
    kind.type === "StripeIdempotencyError" ||
    kind.type === "idempotency_error" ||
    kind.code === "idempotency_error"
  ) return false;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" &&
    status >= 400 && status < 500 &&
    ![408, 409, 424, 429].includes(status);
}

const STRIPE_V1_SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export function preparedCheckoutRetryAllowed(
  createdAtMs: unknown,
  nowMs = Date.now(),
): boolean {
  return typeof createdAtMs === "number" &&
    Number.isFinite(createdAtMs) &&
    createdAtMs > 0 &&
    nowMs >= createdAtMs &&
    nowMs - createdAtMs < STRIPE_V1_SAFE_RETRY_WINDOW_MS;
}

// A prepared Checkout has already been durably recorded, and *may* have been
// submitted to Stripe. Classifying the CURRENT response as a definitive 4xx
// does not prove an earlier attempt did not create a payable Session.
// Thus no Stripe-create error on a prepared order grants cancellation authority.
export function preparedCheckoutFailureCode(
  error: unknown,
): "CHECKOUT_SESSION_RECONCILIATION_REQUIRED" | "CHECKOUT_RETRYABLE" {
  return definitiveStripeCreateFailure(error)
    ? "CHECKOUT_SESSION_RECONCILIATION_REQUIRED"
    : "CHECKOUT_RETRYABLE";
}
