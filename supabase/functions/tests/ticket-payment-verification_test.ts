import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { assertCheckoutSessionBindsPayment, assertPaidOrderMatches } from "../_shared/ticket-payment-verification.ts";
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

Deno.test("missing saved Session or omitted Session evidence must retry, never fulfill", () => {
  assertThrows(() => assertPaidOrderMatches(
    { ...order, stripe_session_id: null }, receipt
  ), Error, "PAYMENT_SESSION_NOT_READY");
  assertThrows(() => assertPaidOrderMatches(
    order, { ...receipt, sessionId: "" }
  ), Error, "PAYMENT_SESSION_NOT_READY");
});

const sessionProof = {
  id: "cs_test_first",
  metadata: { order_id: "order-one" },
  payment_intent: "pi_test_first",
  payment_status: "paid",
  amount_total: 4_000_000,
  currency: "cop",
};
const expected = {
  sessionId: "cs_test_first", orderId: "order-one",
  paymentIntentId: "pi_test_first", amount: 4_000_000, currency: "cop",
};
Deno.test("Stripe Session retrieved by saved id binds the correct PaymentIntent", () => {
  assertEquals(assertCheckoutSessionBindsPayment(sessionProof, expected), undefined);
});
Deno.test("another PI, Session id, or metadata order cannot fulfill a saved order", () => {
  assertThrows(() => assertCheckoutSessionBindsPayment(
    { ...sessionProof, payment_intent: "pi_test_other" }, expected
  ), Error, "PAYMENT_SESSION_MISMATCH");
  assertThrows(() => assertCheckoutSessionBindsPayment(
    { ...sessionProof, id: "cs_test_other" }, expected
  ), Error, "PAYMENT_SESSION_MISMATCH");
  assertThrows(() => assertCheckoutSessionBindsPayment(
    { ...sessionProof, metadata: { order_id: "other-order" } }, expected
  ), Error, "PAYMENT_SESSION_MISMATCH");
  assertThrows(() => assertCheckoutSessionBindsPayment(
    { ...sessionProof, payment_intent: null }, expected
  ), Error, "PAYMENT_SESSION_MISMATCH");
});
Deno.test("unpaid Session or mismatched amount/currency cannot finalize", () => {
  assertThrows(() => assertCheckoutSessionBindsPayment(
    { ...sessionProof, payment_status: "unpaid" }, expected
  ), Error, "PAYMENT_SESSION_NOT_PAID");
  assertThrows(() => assertCheckoutSessionBindsPayment(
    { ...sessionProof, amount_total: 1 }, expected
  ), Error, "PAYMENT_SESSION_AMOUNT_MISMATCH");
  assertThrows(() => assertCheckoutSessionBindsPayment(
    { ...sessionProof, currency: "usd" }, expected
  ), Error, "PAYMENT_SESSION_AMOUNT_MISMATCH");
});
