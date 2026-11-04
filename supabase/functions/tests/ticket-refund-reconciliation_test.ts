import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  collectStripeRefunds,
  stripeRefundReason,
  validatedSuccessfulRefunds,
} from "../_shared/ticket-refund-reconciliation.ts";

const charge = { id: "ch_test123", amount: 8_000_000, currency: "cop" };
const order = { total_cents: 8_000_000, currency: "COP" };
const partial = {
  id: "re_ABC001",
  amount: 2_000_000,
  status: "succeeded",
  charge: "ch_test123",
  reason: "requested_by_customer",
  created: 1,
};
Deno.test("partial Stripe refund stays partial in minor units", () => {
  assertEquals(validatedSuccessfulRefunds(charge, order, [partial], false), [
    partial,
  ]);
  assertEquals(stripeRefundReason(partial.reason), "customer_request");
});
Deno.test("multiple Stripe refunds sort deterministically for SQL idempotency", () => {
  const next = { ...partial, id: "re_ABC002", amount: 6_000_000, created: 2 };
  assertEquals(
    validatedSuccessfulRefunds(charge, order, [next, partial], false).map((r) =>
      r.id
    ),
    ["re_ABC001", "re_ABC002"],
  );
});
Deno.test("pending and failed refunds are not counted as settled money", () => {
  assertEquals(
    validatedSuccessfulRefunds(charge, order, [{
      ...partial,
      status: "pending",
    }, { ...partial, status: "failed" }], false),
    [],
  );
});
Deno.test("rejects refunds issued against a different charge", () => {
  assertThrows(
    () =>
      validatedSuccessfulRefunds(charge, order, [{
        ...partial,
        charge: "ch_foreign",
      }], false),
    Error,
    "REFUND_INVALID_PROVIDER_EVIDENCE",
  );
});
Deno.test("rejects amount/currency mismatch with the saved order", () => {
  assertThrows(
    () =>
      validatedSuccessfulRefunds(
        charge,
        { ...order, total_cents: 10 },
        [],
        false,
      ),
    Error,
    "REFUND_CHARGE_ORDER_MISMATCH",
  );
  assertThrows(
    () =>
      validatedSuccessfulRefunds(
        charge,
        { ...order, currency: "USD" },
        [],
        false,
      ),
    Error,
    "REFUND_CHARGE_ORDER_MISMATCH",
  );
});
Deno.test("rejects incomplete pagination and total refunds beyond charge", () => {
  assertThrows(
    () => validatedSuccessfulRefunds(charge, order, [partial], true),
    Error,
    "REFUND_PAGE_INCOMPLETE",
  );
  assertThrows(
    () =>
      validatedSuccessfulRefunds(charge, order, [partial, {
        ...partial,
        id: "re_ABC002",
        amount: 7_000_000,
      }], false),
    Error,
    "REFUND_EXCEEDS_CHARGE",
  );
});
Deno.test("preserves supported Stripe refund reason mapping", () => {
  assertEquals(stripeRefundReason("duplicate"), "duplicate");
  assertEquals(stripeRefundReason("fraudulent"), "fraudulent");
  assertEquals(stripeRefundReason(null), "other");
});

// Stripe automatically fetches subsequent refund pages via async iteration.
// We must observe all refunds before writing any money to the database.
Deno.test("refund pagination consumes more than Stripe's 100-item page", async () => {
  async function* pagedRefunds() {
    for (let i = 0; i < 101; i++) {
      yield { ...partial, id: `re_PAGED${i}`, amount: 1, created: i };
    }
  }
  const refunds = await collectStripeRefunds(pagedRefunds());
  assertEquals(refunds.length, 101);
  assertEquals(
    validatedSuccessfulRefunds(charge, order, refunds, false).length,
    101,
  );
});

Deno.test("refund pagination fails closed on the explicit maximum", async () => {
  async function* tooManyRefunds() {
    for (let i = 0; i < 4; i++) yield i;
  }
  let message = "";
  try {
    await collectStripeRefunds(tooManyRefunds(), 3);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assertEquals(message, "REFUND_RECONCILIATION_LIMIT");
});

Deno.test("refund pagination aborts on provider fetch failure", async () => {
  async function* brokenPage() {
    yield partial;
    throw new Error("stripe page timeout");
  }
  let message = "";
  try {
    await collectStripeRefunds(brokenPage());
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assertEquals(message, "stripe page timeout");
});
