import { assertEquals } from "jsr:@std/assert@1";
import {
  definitiveStripeCreateFailure,
  preparedCheckoutFailureCode,
  preparedCheckoutRetryAllowed,
} from "../_shared/ticket-checkout-recovery.ts";

Deno.test("network timeout and Stripe 500 never authorize releasing a possibly created Session", () => {
  assertEquals(
    definitiveStripeCreateFailure(new Error("connection reset")),
    false,
  );
  assertEquals(definitiveStripeCreateFailure({ statusCode: 500 }), false);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 503 }), false);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 408 }), false);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 409 }), false);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 429 }), false);
  assertEquals(
    definitiveStripeCreateFailure({
      statusCode: 400,
      type: "StripeIdempotencyError",
    }),
    false,
  );
});
Deno.test("Stripe definitive 4xx classification alone does not permit releasing prepared reservation", () => {
  assertEquals(definitiveStripeCreateFailure({ statusCode: 400 }), true);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 401 }), true);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 403 }), true);
});
Deno.test("preparation is retried only while Stripe v1 idempotency is reliable", () => {
  const now = 1_900_000_000_000;
  assertEquals(
    preparedCheckoutRetryAllowed(now - 22 * 60 * 60 * 1000, now),
    true,
  );
  assertEquals(
    preparedCheckoutRetryAllowed(now - 24 * 60 * 60 * 1000, now),
    false,
  );
  assertEquals(preparedCheckoutRetryAllowed(now + 1000, now), false);
  assertEquals(preparedCheckoutRetryAllowed(null, now), false);
  assertEquals(preparedCheckoutRetryAllowed(Number.NaN, now), false);
});

Deno.test("a Stripe idempotency error never releases a reservation, because it implies an earlier attempt reached Stripe", () => {
  // Same key + different params => the first request WAS processed.
  // Cancelling here would free seats behind a Session that may be payable.
  assertEquals(
    definitiveStripeCreateFailure({
      statusCode: 400,
      type: "StripeIdempotencyError",
    }),
    false,
  );
  assertEquals(
    definitiveStripeCreateFailure({ type: "idempotency_error" }),
    false,
  );
  assertEquals(
    definitiveStripeCreateFailure({ code: "idempotency_error" }),
    false,
  );
  // The guard must win even when the status code alone would look definitive.
  assertEquals(
    definitiveStripeCreateFailure({
      statusCode: 403,
      code: "idempotency_error",
    }),
    false,
  );
});

Deno.test("only a non-retryable 4xx is treated as a definitive rejection", () => {
  // 424 Failed Dependency is ambiguous, like 408/409/429.
  assertEquals(definitiveStripeCreateFailure({ statusCode: 424 }), false);
  // Lower and upper 4xx boundaries.
  assertEquals(definitiveStripeCreateFailure({ statusCode: 499 }), true);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 500 }), false);
  assertEquals(definitiveStripeCreateFailure({ statusCode: 399 }), false);
  // Malformed or absent signal is never permission to release seats.
  assertEquals(definitiveStripeCreateFailure(null), false);
  assertEquals(definitiveStripeCreateFailure(undefined), false);
  assertEquals(definitiveStripeCreateFailure("400"), false);
  assertEquals(definitiveStripeCreateFailure({}), false);
  assertEquals(definitiveStripeCreateFailure({ statusCode: "400" }), false);
});

Deno.test("the retry window rejects boundary, zero, negative and non-numeric timestamps", () => {
  const now = 1_900_000_000_000;
  const exactly23h = now - 23 * 60 * 60 * 1000;
  assertEquals(preparedCheckoutRetryAllowed(exactly23h, now), false);
  assertEquals(preparedCheckoutRetryAllowed(exactly23h + 1, now), true);
  assertEquals(preparedCheckoutRetryAllowed(0, now), false);
  assertEquals(preparedCheckoutRetryAllowed(-1, now), false);
  assertEquals(preparedCheckoutRetryAllowed("1900000000000", now), false);
  assertEquals(preparedCheckoutRetryAllowed(undefined, now), false);
  assertEquals(preparedCheckoutRetryAllowed(Infinity, now), false);
});

Deno.test("prepared Checkout still retries ambiguous network failures with the original key", () => {
  for (
    const error of [
      new Error("lost response"),
      { statusCode: 409 },
      { statusCode: 429 },
      { statusCode: 500 },
      { code: "idempotency_error", statusCode: 403 },
    ]
  ) {
    assertEquals(preparedCheckoutFailureCode(error), "CHECKOUT_RETRYABLE");
  }
});
