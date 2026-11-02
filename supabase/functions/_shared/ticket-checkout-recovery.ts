// Stripe v1 idempotent creates may have an ambiguous outcome after a
// dropped network response. Never release a reservation unless Stripe
// definitively rejected Session creation.
export function definitiveStripeCreateFailure(
  error: unknown,
): boolean {
  if (typeof error !== "object" || error === null) return false;
  const kind = error as { type?: string; code?: string };
  // Stripe can return an idempotency mismatch after the first Session WAS
  // created; this is not permission to release its reserved tickets.
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
