import { assertEquals } from "jsr:@std/assert@1";
import {
  definitiveStripeCreateFailure,
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
Deno.test("Stripe definitive validation/authentication rejection can release reservation", () => {
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
