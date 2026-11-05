/**
 * ticket-payment-webhook — Stripe webhook receiver (Phase 1 events).
 *
 * Subscribed events (configure all in Stripe Dashboard):
 *   - checkout.session.completed → ticket_payment_finalize (primary Checkout path)
 *   - checkout.session.async_payment_succeeded → ticket_payment_finalize (delayed methods)
 *   - checkout.session.expired → ticket_checkout_cancel (release qty_pending)
 *   - payment_intent.succeeded → ticket_payment_finalize (idempotent if session event also fires)
 *   - charge.refunded → ticket_payment_refund RPC
 *
 * Auth: Stripe signature verification ONLY. No Supabase JWT — Stripe doesn't
 * send one. `verify_jwt = false` in supabase/config.toml.
 *
 * Idempotency: Stripe retries up to 3 days on 5xx. We dedupe on `event.id`
 * via the existing `idempotency_keys` table — same event.id → 200 OK no-op.
 *
 * Audit fixes implemented:
 *   B1 — Reads ONLY `pi.metadata.order_id`; everything else from DB.
 *   R4 — Single SECURITY DEFINER RPC handles flip+attendees+qty in one txn.
 *   R5 — `charge.payment_intent` accessed correctly as a string|object.
 *   R6 — Attendees already created in checkout with caller-provided UUIDs +
 *        QR JWTs; webhook just flips their status.
 *
 * PDF + email (HE-3 react-pdf MIT + SendGrid) are PHASE-1.5 best-effort:
 *   - If SENDGRID_API_KEY is unset, we skip email silently and return 200.
 *   - Buyers retrieve tickets via /me/tickets/<order_id>?token=<access>
 *     (task 008) regardless. The email is delight, not the source of truth.
 */
import Stripe from "npm:stripe@23.0.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorBody, getCorsHeaders, jsonResponse } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabase-clients.ts";
import { assertCheckoutSessionBindsPayment, assertPaidOrderMatches } from "../_shared/ticket-payment-verification.ts";
import { collectStripeRefunds, validatedSuccessfulRefunds, stripeRefundReason } from "../_shared/ticket-refund-reconciliation.ts";
import { expiredSessionMatchesOrder, webhookEventMatchesMode, webhookSecretsAreDistinct, type TicketStripeMode } from "../_shared/ticket-stripe-webhook-guards.ts";
// Lazy Stripe init so missing-key configurations surface as 500 CONFIG_ERROR
// rather than crashing on cold-start before headers are sent.
const stripeClients = new Map<string, Stripe>();
interface TicketFinalizeData {
  order?: {
    id?: string;
    access_token?: string;
    buyer_email?: string;
    short_id?: string | null;
  };
  event?: {
    name?: string;
    address?: string | null;
  };
  attendees?: unknown[];
}

function getStripe(mode: "live" | "sandbox"): Stripe | null {
  const existing = stripeClients.get(mode);
  if (existing) return existing;
  const key = Deno.env.get(mode === "sandbox"
    ? "STRIPE_SANDBOX_SECRET_KEY"
    : "STRIPE_SECRET_KEY");
  if (!key || (mode === "sandbox" && !/^(rk|sk)_test_/.test(key))) return null;
  const client = new Stripe(key, {
    apiVersion: "2026-09-30.endive",
    httpClient: Stripe.createFetchHttpClient(),
  });
  stripeClients.set(mode, client);
  return client;
}
const ENDPOINT = "ticket-payment-webhook";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: getCorsHeaders(req),
    });
  }
  if (req.method !== "POST") {
    return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "Use POST"), 405, req);
  }
  // Authenticate the raw payload using the independent endpoint secrets.
  // Only a verified signature determines which Stripe account handles an event.
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return jsonResponse(errorBody("BAD_SIGNATURE", "Missing stripe-signature header"), 400, req);
  }
  const configurations = [
    { mode: "live" as const, secret: Deno.env.get("STRIPE_WEBHOOK_SECRET") },
    { mode: "sandbox" as const, secret: Deno.env.get("STRIPE_SANDBOX_WEBHOOK_SECRET") },
  ];
  if (!webhookSecretsAreDistinct(configurations[0].secret, configurations[1].secret)) {
    console.error("ticket-payment-webhook: live and sandbox signing secrets must differ");
    return jsonResponse(errorBody("CONFIG_ERROR", "Stripe signing configuration is invalid"), 500, req);
  }
  if (!configurations.some(({ mode, secret }) => !!secret && !!getStripe(mode))) {
    console.error("ticket-payment-webhook: no complete Stripe webhook configuration");
    return jsonResponse(errorBody("CONFIG_ERROR", "Server is missing Stripe credentials"), 500, req);
  }
  let event: Stripe.Event | null = null;
  let stripe: Stripe | null = null;
  let verifiedMode: TicketStripeMode | null = null;
  for (const { mode, secret } of configurations) {
    const candidate = getStripe(mode);
    if (!secret || !candidate) continue;
    try {
      const verified = await candidate.webhooks.constructEventAsync(rawBody, sig, secret);
      // Both directions must agree. A valid signature alone does not establish payment mode.
      if (!webhookEventMatchesMode(mode, verified.livemode)) continue;
      event = verified;
      stripe = candidate;
      verifiedMode = mode;
      break;
    } catch {
      // Another environment may have signed this request; never trust raw JSON.
    }
  }
  if (!event || !stripe || !verifiedMode) {
    console.error("ticket-payment-webhook: signature verification failed");
    return jsonResponse(errorBody("BAD_SIGNATURE", "Stripe signature did not match"), 400, req);
  }
  // 2. Idempotency — Stripe retries on 5xx. Same event.id = no-op success.
  const service = getServiceClient();
  const idemKey = `stripe_${event.id}`;
  {
    const { data: cached } = await service.from("idempotency_keys").select(
      "response",
    ).eq("key", idemKey).eq("endpoint", ENDPOINT).maybeSingle();
    if (cached?.response) {
      return jsonResponse(
        {
          success: true,
          replayed: true,
        },
        200,
        req,
      );
    }
  }
  // 3. Branch on event type.
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await handleCheckoutSessionPaid(
        event.data.object as Stripe.Checkout.Session,
        service,
      );
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      await handleCheckoutSessionUnpaid(
        event.data.object as Stripe.Checkout.Session,
        service,
        verifiedMode,
      );
    } else if (event.type === "payment_intent.succeeded") {
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent, service, stripe);
    } else if (event.type === "charge.refunded") {
      await handleRefund(event.data.object as Stripe.Charge, service, stripe);
    } else if (event.type === "refund.created" || event.type === "refund.updated") {
      await handleRefundUpdate(event.data.object as Stripe.Refund, service, stripe);
    } else {
      // Unsubscribed event types: 200 OK so Stripe stops retrying. Logged for
      // observability but not an error.
      console.log(
        `ticket-payment-webhook: ignoring unsubscribed event type ${event.type}`,
      );
    }
  } catch (err) {
    console.error("ticket-payment-webhook: handler failed", {
      event_id: event.id,
      err: err instanceof Error ? err.message : err,
    });
    // 500 → Stripe retries with exponential backoff (up to 3 days).
    return jsonResponse(
      errorBody(
        "HANDLER_FAILED",
        err instanceof Error ? err.message : "Unknown handler error",
      ),
      500,
      req,
    );
  }
  // 4. Cache the (small) success response so retries within the 3-day window
  //    short-circuit at step 2.
  const { error: idemWriteErr } = await service.from("idempotency_keys").upsert(
    {
      key: idemKey,
      endpoint: ENDPOINT,
      response: {
        success: true,
        event_type: event.type,
      },
    },
    { onConflict: "key" },
  );
  if (idemWriteErr) {
    console.error("ticket-payment-webhook: idempotency_keys upsert failed", idemWriteErr);
  }
  return jsonResponse(
    {
      success: true,
      event_id: event.id,
    },
    200,
    req,
  );
});
function paymentIntentIdFromSession(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

async function finalizePaidOrder(
  orderId: string,
  paymentIntentId: string,
  amount: number | null,
  currency: string | null,
  service: SupabaseClient,
  sessionId: string,
) {
  // The webhook signature authenticates Stripe, NOT whether a payment matches
  // this particular order. Compare the settled amount, currency and identity.
  const { data: order, error: lookupError } = await service.from("event_orders")
    .select("id,total_cents,currency,status,stripe_session_id,stripe_payment_intent")
    .eq("id", orderId).maybeSingle();
  if (lookupError) throw new Error("PAYMENT_ORDER_LOOKUP_FAILED");
  assertPaidOrderMatches(order, { amount, currency, paymentIntentId, sessionId });
  const { data, error } = await service.rpc("ticket_payment_finalize", {
    p_order_id: orderId,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) throw new Error("ticket_payment_finalize failed: " + error.message);

  try {
    await maybeSendTicketEmail(data as TicketFinalizeData | null);
  } catch (emailErr) {
    console.error(
      "ticket-payment-webhook: email send failed; tickets remain accessible via /me/tickets",
      emailErr,
    );
  }
}

async function handleCheckoutSessionPaid(
  session: Stripe.Checkout.Session,
  service: SupabaseClient,
) {
  const orderId = session.metadata?.order_id;
  if (!orderId) {
    console.log(
      `checkout session paid missing order_id; ignoring session=${session.id}`,
    );
    return;
  }
  if (session.payment_status !== "paid") {
    console.log(
      `checkout session not paid yet; session=${session.id} status=${session.payment_status}`,
    );
    return;
  }
  const piId = paymentIntentIdFromSession(session);
  if (!piId) {
    console.log(
      `checkout session paid missing payment_intent; session=${session.id}`,
    );
    return;
  }
  await finalizePaidOrder(orderId, piId, session.amount_total, session.currency, service, session.id);
}

async function handleCheckoutSessionUnpaid(
  session: Stripe.Checkout.Session,
  service: SupabaseClient,
  mode: TicketStripeMode,
) {
  if (session.payment_status === "paid") throw new Error("PAID_SESSION_CANNOT_CANCEL");
  const orderId = session.metadata?.order_id;
  if (!orderId) {
    console.log(
      `checkout.session.expired missing order_id; ignoring session=${session.id}`,
    );
    return;
  }
  // A signed Stripe event is not authorization to cancel an arbitrary order
  // named in its metadata. Only its own persisted Session may release seats.
  const { data: order, error: lookupError } = await service.from("event_orders")
    .select("stripe_session_id").eq("id", orderId).maybeSingle();
  if (lookupError || !order) throw new Error("EXPIRY_ORDER_LOOKUP_FAILED");
  if (!expiredSessionMatchesOrder(order.stripe_session_id, session.id, mode)) {
    throw new Error("EXPIRY_SESSION_MISMATCH");
  }
  const { error } = await service.rpc("ticket_checkout_cancel", {
    p_order_id: orderId,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("ORDER_NOT_FOUND") || msg.includes("ORDER_NOT_PENDING")) {
      console.error(
        `ticket_checkout_cancel (expired): ${msg} order=${orderId}`,
      );
      return;
    }
    throw new Error(`ticket_checkout_cancel failed: ${msg}`);
  }
}

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent, service: SupabaseClient, stripe: Stripe) {
  const orderId = pi.metadata?.order_id;
  if (!orderId) {
    console.log(
      `payment_intent.succeeded had no order_id metadata; ignoring pi=${pi.id}`,
    );
    return;
  }
  if (pi.status !== "succeeded") return;
  // Stripe's signed PaymentIntent proves a payment exists, not that it was
  // created by the Checkout Session reserved for this particular order.
  const { data: order, error: orderError } = await service.from("event_orders")
    .select("stripe_session_id").eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error("PAYMENT_ORDER_LOOKUP_FAILED");
  if (!order.stripe_session_id) {
    // Stripe can send the PI webhook before ticket-checkout persists its
    // Session ID. Return 500 so Stripe retries; NEVER fulfill unbound PI data.
    throw new Error("PAYMENT_SESSION_NOT_READY");
  }
  // Use the same account that authenticated the signed webhook.
  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  assertCheckoutSessionBindsPayment(session, {
    sessionId: order.stripe_session_id,
    orderId,
    paymentIntentId: pi.id,
    amount: pi.amount_received,
    currency: pi.currency,
  });
  await finalizePaidOrder(orderId, pi.id, pi.amount_received, pi.currency, service, session.id);
}
async function handleRefundUpdate(
  refund: Stripe.Refund, service: SupabaseClient, stripe: Stripe,
) {
  if (refund.status !== "succeeded") return; // pending/failed is not settled money
  const chargeId = typeof refund.charge === "string"
    ? refund.charge : refund.charge?.id;
  if (!chargeId) throw new Error("REFUND_CHARGE_NOT_BOUND");
  const charge = await stripe.charges.retrieve(chargeId);
  await handleRefund(charge, service, stripe);
}

async function handleRefund(
  charge: Stripe.Charge, service: SupabaseClient, stripe: Stripe,
) {
  const piId = typeof charge.payment_intent === "string"
    ? charge.payment_intent : charge.payment_intent?.id ?? null;
  if (!piId) {
    console.log(
      `charge.refunded had no payment_intent; ignoring charge=${charge.id}`,
    );
    return;
  }
  const { data: order, error: lookupErr } = await service.from("event_orders")
    .select("id,total_cents,currency")
    .eq("stripe_payment_intent", piId).maybeSingle();
  if (lookupErr) throw new Error("REFUND_ORDER_LOOKUP_FAILED");
  if (!order) {
    console.warn("ticket-payment-webhook: unknown refund PaymentIntent", piId);
    return;
  }

  // Ask Stripe for the current settled refunds rather than trusting an
  // aggregate amount or an old/out-of-order charge.refunded snapshot.
  const refunds = await collectStripeRefunds<Stripe.Refund>(
    stripe.refunds.list({ charge: charge.id, limit: 100 }),
  );
  const settled = validatedSuccessfulRefunds(charge, order, refunds, false);
  for (const refund of settled) {
    // The existing v2 RPC locks the order, dedupes Stripe refund IDs,
    // records amounts and retains tickets on amount-only partial refunds.
    const { error } = await service.rpc("ticket_payment_refund_v2", {
      p_order_id: order.id,
      p_amount_cents: refund.amount,
      p_reason: stripeRefundReason(refund.reason),
      p_stripe_refund_id: refund.id,
      p_initiated_by: null,
      p_initiated_via: "stripe_dashboard",
      p_attendee_ids: null,
    });
    if (error) throw new Error(`TICKET_REFUND_RECONCILIATION_FAILED: ${error.message}`);
  }
}
// ---------------------------------------------------------------------------
// Email — best-effort; skipped silently when SENDGRID_API_KEY is unset.
// PDF rendering is deferred to Phase 1.5 (HE-3 react-pdf integration).
// ---------------------------------------------------------------------------
async function maybeSendTicketEmail(finalizeData: TicketFinalizeData | null) {
  const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
  if (!sendgridKey) return; // Phase 1.5 — buyers retrieve tickets via /me/tickets
  const data = finalizeData;
  if (!data?.order?.buyer_email || !data?.event?.name) return;
  const ticketsUrl =
    `https://mdeai.co/me/tickets/${data.order.id}?token=${data.order.access_token}`;
  const html = `
    <h2>Your tickets — ${escapeHtml(data.event.name)}</h2>
    <p>Order: <strong>${escapeHtml(data.order.short_id ?? "")}</strong></p>
    <p>${
    escapeHtml(String(data.attendees?.length ?? 0))
  } ticket(s) confirmed.</p>
    <p>View your QR codes any time: <a href="${ticketsUrl}">${ticketsUrl}</a></p>
    <p style="color:#888;font-size:12px">${
    escapeHtml(data.event.address ?? "")
  }</p>
  `;
  const body = {
    personalizations: [
      {
        to: [
          {
            email: data.order.buyer_email,
          },
        ],
      },
    ],
    from: {
      email: "tickets@mdeai.co",
      name: "mdeai Events",
    },
    subject: `Your ticket: ${data.event.name}`,
    content: [
      {
        type: "text/html",
        value: html,
      },
    ],
  };
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid ${res.status}: ${text}`);
  }
}
function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    ">",
    "&gt;",
  ).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
