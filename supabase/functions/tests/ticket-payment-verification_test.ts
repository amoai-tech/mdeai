import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { assertPaidOrderMatches } from "../_shared/ticket-payment-verification.ts";
import type { PaidOrderSnapshot, StripePaymentEvidence } from "../_shared/ticket-payment-verification.ts";

const order: PaidOrderSnapshot = {
  id: "order-one",
  total_cents: 4_000_000, // COP 40,000 in Stripe minor units
  currency: "COP",
  status: "pending",
  stripe_session_id: "cs_test_first",
  stripe_payment_intent: null,
};
const receipt: StripePaymentEvidence = {
  amount: 4_000_000, currency: "cop", paymentIntentId: "pi_test_first",
  sessionId: "cs_test_first",
};
Deno.test("exact Stripe test COP amount and session match the stored order", () => {
  assertEquals(assertPaidOrderMatches(order, receipt), undefined);
});
Deno.test("underpaid, overpaid, missing and negative amounts never finalize", () => {
  for (const amount of [3_999_999, 4_000_001, null, 0, -1, NaN]) {
    assertThrows(() => assertPaidOrderMatches(order, { ...receipt, amount }), Error, "PAYMENT_AMOUNT_MISMATCH");
  }
});
Deno.test("wrong currency or missing currency never finalizes", () => {
  for (const currency of ["usd", "mxn", "", null]) {
    assertThrows(() => assertPaidOrderMatches(order, { ...receipt, currency }), Error, "PAYMENT_CURRENCY_MISMATCH");
  }
});
Deno.test("foreign Checkout Session cannot fulfill this order", () => {
  assertThrows(() => assertPaidOrderMatches(order, { ...receipt, sessionId: "cs_test_other" }), Error, "PAYMENT_SESSION_MISMATCH");
});
Deno.test("paid order replays only for the same PaymentIntent", () => {
  const paidOrder = { ...order, status: "paid", stripe_payment_intent: "pi_test_first" };
  assertEquals(assertPaidOrderMatches(paidOrder, receipt), undefined);
  assertThrows(() => assertPaidOrderMatches(paidOrder, { ...receipt, paymentIntentId: "pi_test_other" }), Error, "PAYMENT_INTENT_MISMATCH");
});
Deno.test("cancelled, missing or unknown orders never fulfill", () => {
  assertThrows(() => assertPaidOrderMatches(null, receipt), Error, "PAYMENT_ORDER_NOT_FOUND");
  assertThrows(() => assertPaidOrderMatches({ ...order, status: "cancelled" }, receipt), Error, "PAYMENT_ORDER_BAD_STATE");
});
