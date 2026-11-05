/**
 * ticket-checkout — Phase 1 events (revenue-unlocking edge fn).
 *
 * Receives a ticket-purchase request, atomically:
 *   1. Checks ticket capacity (qty_sold + qty_pending + quantity <= qty_total)
 *      AND increments qty_pending so a parallel checkout sees fewer slots
 *   2. Creates a `pending` order with ticket_id + quantity + access_token
 *   3. Creates N `pending` attendee rows with caller-provided UUIDs +
 *      pre-signed QR JWTs (JWT.attendee_id always == event_attendees.id)
 * — then opens a Stripe Checkout Session referencing only `order_id` in
 * payment_intent_data.metadata. The webhook (task 005) finalises:
 *   - flips order status pending → paid
 *   - flips attendees status pending → active
 *   - increments qty_sold + decrements qty_pending
 *
 * Auth: optional. Anonymous purchase allowed (buyer_email + access_token
 * carry identity). verify_jwt = false in supabase/config.toml for this fn.
 *
 * Idempotency: uses the existing `idempotency_keys` table — same key →
 * same Stripe URL on replay. Required for buyer-side network retries to
 * avoid double-creating orders + double-billing.
 *
 * Audit fixes implemented:
 *   B1 — Stripe metadata only carries { order_id }; no PII, no attendees array.
 *   B2 — order persists ticket_id + quantity so the webhook knows what to
 *        finalise.
 *   R6 — attendee UUIDs generated in JS *first*, then JWTs signed with
 *        those UUIDs, then INSERT-ed → JWT.attendee_id and row PK always
 *        match.
 *   #3 — qty_pending column increments at checkout, decrements on
 *        webhook finalize (or cancel). Prevents 50-concurrent-buyer
 *        oversell.
 */
import Stripe from "npm:stripe@23.0.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { errorBody, getCorsHeaders, jsonResponse } from "../_shared/http.ts";
import { getServiceClient, getUserId } from "../_shared/supabase-clients.ts";
import { resolveCheckoutBuyer } from "../_shared/ticket-checkout-buyer.ts";
import { signJwtHs256 } from "../_shared/jwt.ts";
import { deriveCheckoutAccessToken, duplicateCheckoutCode } from "../_shared/checkout-access-token.ts";
import { preparedCheckoutFailureCode, preparedCheckoutRetryAllowed } from "../_shared/ticket-checkout-recovery.ts";
// Initialise Stripe lazily so a missing key is reported via 500 CONFIG_ERROR
// rather than crashing the function on cold-start before headers are sent.
let _stripe: Stripe | null = null;
let _stripeMode: "sandbox" | "live" | null = null;
function getStripe(): Stripe | null {
  // Require an explicit server choice: missing configuration must never charge live.
  const mode = Deno.env.get("STRIPE_TICKET_CHECKOUT_MODE");
  if (mode !== "live" && mode !== "sandbox") return null;
  if (_stripe && _stripeMode === mode) return _stripe;
  const key = Deno.env.get(mode === "sandbox"
    ? "STRIPE_SANDBOX_SECRET_KEY"
    : "STRIPE_SECRET_KEY");
  if (!key || (mode === "sandbox" && !/^(rk|sk)_test_/.test(key))) return null;
  _stripe = new Stripe(key, {
    apiVersion: "2026-09-30.endive",
    httpClient: Stripe.createFetchHttpClient(),
  });
  _stripeMode = mode;
  return _stripe;
}
// Zod schema. quantity is bounded by a documented safe transport ceiling (10;
// all current tiers use 10). The atomic RPC still enforces each tier's own
// min_per_order/max_per_order, sale window and remaining capacity. Client-side
// errors return 400 fast; the server owns the business truth.
const AttendeeSchema = z.object({
  email: z.string().email().max(120),
  full_name: z.string().min(1).max(120),
});
const RequestSchema = z.object({
  event_id: z.string().uuid(),
  ticket_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  buyer_email: z.string().email().max(120),
  buyer_name: z.string().min(1).max(120),
  attendees: z.array(AttendeeSchema).min(1).max(10),
  idempotency_key: z.string().uuid(),
  return_url_success: z.string().url().max(500),
  return_url_cancel: z.string().url().max(500),
});
const ENDPOINT = "ticket-checkout";
type CheckoutService = ReturnType<typeof getServiceClient>;
type PreparedCheckout = {
  state: "prepared";
  request_hash: string;
  order_id: string;
  short_id: string | null;
  access_token: string;
  created_at_ms: number;
  stripe_params: Stripe.Checkout.SessionCreateParams;
};

// Both fresh and retried attempts send byte-equivalent Stripe parameters and
// the same Stripe idempotency key. This closes the "Stripe created a Session,
// but the network response was lost" gap without another reservation.
export async function completePreparedCheckout(
  req: Request,
  service: CheckoutService,
  stripe: Stripe,
  key: string,
  prepared: PreparedCheckout,
  firstAttempt = false,
): Promise<Response> {
  if (!preparedCheckoutRetryAllowed(prepared.created_at_ms)) {
    return jsonResponse(errorBody("CHECKOUT_RECONCILIATION_REQUIRED",
      "Checkout retry window expired; verify the Stripe Session before trying again"), 409, req);
  }
  const { data: order, error: lookupError } = await service.from("event_orders")
    .select("status,stripe_session_id").eq("id", prepared.order_id).maybeSingle();
  if (lookupError || !order) {
    return jsonResponse(errorBody("CHECKOUT_ORDER_LOOKUP_FAILED",
      "Could not verify existing checkout"), 503, req);
  }
  if (duplicateCheckoutCode(order.status) === "CHECKOUT_KEY_CANCELLED") {
    return jsonResponse(errorBody("CHECKOUT_KEY_CANCELLED",
      "This checkout was cancelled; start a new checkout with a new key"), 409, req);
  }
  // Only a still-held reservation may reach Stripe. A paid, partially refunded
  // or refunded order already has its money and must never be offered another
  // Checkout URL; those buyers need the order reconciled, not a new payment.
  // (A completed checkout normally returns earlier from the success cache; this
  // guards the case where that cache write was lost.)
  if (order.status !== "pending") {
    return jsonResponse(errorBody("CHECKOUT_RECONCILIATION_REQUIRED",
      "Checkout reservation is no longer held; verify the order before retrying"), 409, req);
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      prepared.stripe_params, { idempotencyKey: key },
    );
  } catch (err) {
    console.error("Stripe Session creation failed:", err);
    // The prepared request may have reached Stripe before an earlier response
    // was lost, even when no Session ID was saved. A later 401/403/400 cannot
    // prove an earlier Session was not created. Never release the hold based
    // only on a Stripe-create error; require reconciliation instead.
    // An unmistakable validation error on the FIRST create can release a hold.
    // A first-attempt rejection can release its new hold, while a later
    // authentication/permission failure might mask an earlier payable Session.
    const errorData = typeof err === "object" && err !== null
      ? err as { statusCode?: number; type?: string; code?: string }
      : null;
    const rejectedInitialRequest = (
      (errorData?.statusCode === 400 && errorData.type === "StripeInvalidRequestError") ||
      (errorData?.statusCode === 401 && errorData.type === "StripeAuthenticationError") ||
      (errorData?.statusCode === 403 &&
        ["StripePermissionError", "StripeAuthenticationError"].includes(errorData.type ?? ""))
    );
    if (firstAttempt && !order.stripe_session_id && rejectedInitialRequest &&
        errorData?.code !== "idempotency_error") {
      const { error: releaseError } = await service.rpc("ticket_checkout_cancel", {
        p_order_id: prepared.order_id,
      });
      if (releaseError) {
        console.error("Checkout reservation release failed:", releaseError);
        return jsonResponse(errorBody("CHECKOUT_RELEASE_FAILED",
          "Unable to release invalid Checkout reservation"), 503, req);
      }
      return jsonResponse(errorBody("STRIPE_REJECTED",
        "Stripe rejected invalid Checkout parameters"), 502, req);
    }
    const code = preparedCheckoutFailureCode(err);
    return jsonResponse(errorBody(code,
      code === "CHECKOUT_SESSION_RECONCILIATION_REQUIRED"
        ? "Stripe rejected this attempt; an earlier Checkout Session may still be payable. Reconcile before releasing tickets"
        : "Stripe response is uncertain; retry Checkout with the same request"), 503, req);
  }
  if (!session.url) {
    return jsonResponse(errorBody("CHECKOUT_SESSION_NOT_READY",
      "Stripe did not provide a Checkout URL; retry the same request"), 503, req);
  }

  if (order.stripe_session_id && order.stripe_session_id !== session.id) {
    return jsonResponse(errorBody("CHECKOUT_SESSION_CONFLICT",
      "Another Stripe Session is already bound to the order"), 503, req);
  }
  if (!order.stripe_session_id) {
    const { error: saveError } = await service.from("event_orders")
      .update({ stripe_session_id: session.id }).eq("id", prepared.order_id)
      .is("stripe_session_id", null);
    if (saveError) {
      console.error("Stripe Session binding failed:", saveError);
      return jsonResponse(errorBody("CHECKOUT_SESSION_NOT_PERSISTED",
        "Could not bind existing Checkout; retry with the same key"), 503, req);
    }
  }
  const { data: linked, error: linkError } = await service.from("event_orders")
    .select("stripe_session_id").eq("id", prepared.order_id).maybeSingle();
  if (linkError || linked?.stripe_session_id !== session.id) {
    return jsonResponse(errorBody("CHECKOUT_SESSION_NOT_PERSISTED",
      "Could not verify existing Checkout binding; retry with same key"), 503, req);
  }

  const result = {
    request_hash: prepared.request_hash,
    success: true,
    data: {
      stripe_session_url: session.url,
      order_id: prepared.order_id,
      short_id: prepared.short_id,
      access_token: prepared.access_token,
    },
  };
  const { error: cacheError } = await service.from("idempotency_keys").upsert({
    key, endpoint: ENDPOINT, response: result,
  }, { onConflict: "key" });
  if (cacheError) {
    // Prepared intent remains durable; the next identical request can
    // retrieve the SAME Session using the original Stripe key.
    console.error("Checkout success cache write failed:", cacheError);
  }
  return jsonResponse(result, 200, req);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: getCorsHeaders(req),
    });
  }
  if (req.method !== "POST") {
    return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "Use POST"), 405, req);
  }
  // 1. Parse + validate body. Reject malformed first (no DB calls yet).
  let body;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (err) {
    return jsonResponse(
      errorBody(
        "INVALID_PAYLOAD",
        "Request payload didn't validate",
        err instanceof z.ZodError ? err.flatten() : String(err),
      ),
      400,
      req,
    );
  }
  if (body.attendees.length !== body.quantity) {
    return jsonResponse(
      errorBody(
        "ATTENDEES_MISMATCH",
        "attendees array length must equal quantity",
      ),
      400,
      req,
    );
  }
  // A verified user JWT is the only authority for linking an order to an account.
  // The public publishable/anon key is intentionally allowed for guest Checkout.
  const { buyerUserId, invalidSession } = await resolveCheckoutBuyer(
    req.headers.get("Authorization"), req.headers.get("apikey"),
    Deno.env.get("SUPABASE_ANON_KEY") ?? null, getUserId,
  );
  if (invalidSession) {
    return jsonResponse(errorBody("INVALID_USER_SESSION", "Please sign in again"), 401, req);
  }
  // A reused checkout key must refer to the same cart and *verified* buyer.
  const service = getServiceClient();
  const requestIdentity = JSON.stringify({
    event_id: body.event_id, ticket_id: body.ticket_id,
    quantity: body.quantity, buyer_email: body.buyer_email.toLowerCase(),
    buyer_name: body.buyer_name, attendees: body.attendees,
    ...(buyerUserId ? { buyer_user_id: buyerUserId } : {}),
    return_url_success: body.return_url_success,
    return_url_cancel: body.return_url_cancel,
  });
  const requestHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestIdentity)),
  )).map((v) => v.toString(16).padStart(2, "0")).join("");
  const { data: cached, error: cacheReadError } = await service.from("idempotency_keys")
    .select("response").eq("key", body.idempotency_key)
    .eq("endpoint", ENDPOINT).maybeSingle();
  if (cacheReadError) {
    return jsonResponse(errorBody("CHECKOUT_CACHE_UNAVAILABLE",
      "Could not verify Checkout request identity"), 503, req);
  }
  if (cached?.response) {
    if (cached.response.request_hash && cached.response.request_hash !== requestHash) {
      return jsonResponse(errorBody("IDEMPOTENCY_KEY_REUSED", "Use a new key when checkout details change"), 409, req);
    }
    if (cached.response.success && cached.response.data?.stripe_session_url) {
      const { data: previous, error: previousError } = await service
        .from("event_orders").select("status")
        .eq("id", cached.response.data.order_id).maybeSingle();
      if (previousError || !previous) {
        return jsonResponse(errorBody("CHECKOUT_ORDER_LOOKUP_FAILED", "Could not verify the existing checkout"), 503, req);
      }
      if (duplicateCheckoutCode(previous.status) === "CHECKOUT_KEY_CANCELLED") {
        return jsonResponse(errorBody("CHECKOUT_KEY_CANCELLED", "This checkout was cancelled; start a new checkout with a new key"), 409, req);
      }
      return jsonResponse(cached.response, 200, req);
    }
    const prepared = cached.response as PreparedCheckout;
    if (prepared.state === "prepared" && prepared.stripe_params &&
        prepared.order_id && prepared.request_hash === requestHash) {
      const stripe = getStripe();
      if (!stripe) return jsonResponse(errorBody("CONFIG_ERROR", "Stripe is not configured"), 500, req);
      return completePreparedCheckout(req, service, stripe, body.idempotency_key, prepared);
    }
    return jsonResponse(errorBody("CHECKOUT_IN_PROGRESS", "Checkout is still being prepared; retry shortly"), 409, req);
  }
  // 3. Pre-mint UUIDs + sign JWTs in JS BEFORE the RPC call.
  //    Each attendee gets its real PK now, so JWT.attendee_id == event_attendees.id always.
  const qrSecret = Deno.env.get("QR_SIGNING_SECRET");
  if (!qrSecret) {
    console.error("QR_SIGNING_SECRET is not configured");
    return jsonResponse(
      errorBody("CONFIG_ERROR", "Server is missing required secret"),
      500,
      req,
    );
  }
  const stripe = getStripe();
  if (!stripe) {
    console.error("ticket-checkout: Stripe payment mode or matching API key is not configured");
    return jsonResponse(
      errorBody("CONFIG_ERROR", "Server is missing Stripe credentials"),
      500,
      req,
    );
  }
  // One stable token per checkout key. The existing UNIQUE constraint on
  // event_orders.access_token makes duplicate parallel reservations roll back
  // entirely, including the pending capacity increment in the same RPC.
  const accessToken = await deriveCheckoutAccessToken(qrSecret, body.idempotency_key);
  const nowSec = Math.floor(Date.now() / 1000);
  const attendeesWithJwts = await Promise.all(body.attendees.map(async (a) => {
    const id = crypto.randomUUID();
    const qr_token = await signJwtHs256({
      attendee_id: id,
      event_id: body.event_id,
      iat: nowSec,
    }, qrSecret);
    return {
      id,
      email: a.email,
      full_name: a.full_name,
      qr_token,
    };
  }));
  // 4. Atomic RPC: capacity check + create pending order + create pending attendees.
  //    The RPC does pg_advisory_xact_lock(event_id) + FOR UPDATE on the ticket row +
  //    qty_sold+qty_pending+quantity check. This is the oversell guard.
  const { data: rpcDataRaw, error: rpcError } = await service.rpc(
    "ticket_checkout_create_pending",
    {
      p_event_id: body.event_id,
      p_ticket_id: body.ticket_id,
      p_quantity: body.quantity,
      p_buyer_email: body.buyer_email,
      p_buyer_name: body.buyer_name,
      p_access_token: accessToken,
      p_attendees: attendeesWithJwts,
      p_buyer_user_id: buyerUserId,
    },
  );
  if (rpcError) {
    // RPC raises EXCEPTION with a known code in the message; surface it verbatim.
    const msg = rpcError.message ?? "";
    const code = msg.match(/[A-Z][A-Z_]+/)?.[0] ?? "RPC_ERROR";
    // The unique token constraint rejects a concurrent duplicate *inside*
    // the reservation transaction; it never holds a second seat.
    if (rpcError.code === "23505") {
      const { data: previous, error: previousError } = await service
        .from("event_orders").select("status")
        .eq("access_token", accessToken).maybeSingle();
      if (previousError) {
        return jsonResponse(errorBody("CHECKOUT_ORDER_LOOKUP_FAILED", "Could not verify the existing checkout"), 503, req);
      }
      if (duplicateCheckoutCode(previous?.status) === "CHECKOUT_KEY_CANCELLED") {
        return jsonResponse(errorBody("CHECKOUT_KEY_CANCELLED", "This checkout was cancelled; start a new checkout with a new key"), 409, req);
      }
      return jsonResponse(errorBody("CHECKOUT_IN_PROGRESS", "Existing checkout is being prepared; retry shortly"), 409, req);
    }
    const httpStatus = code === "OUT_OF_STOCK" ? 409 : 400;
    console.error(`ticket-checkout RPC error: ${code}`, rpcError);
    return jsonResponse(errorBody(code, msg), httpStatus, req);
  }
  const rpcData = rpcDataRaw;
  // Validate exact server-priced money before handing it to Stripe.
  const { data: pricedOrder, error: pricedOrderError } = await service
    .from("event_orders").select("total_cents,currency").eq("id", rpcData.order_id).single();
  const chargeCurrency = pricedOrder?.currency?.toLowerCase();
  if (pricedOrderError || chargeCurrency !== "cop" ||
      !Number.isSafeInteger(Number(rpcData.price_cents)) ||
      Number(rpcData.price_cents) <= 0 ||
      Number(pricedOrder?.total_cents) !== Number(rpcData.price_cents) * body.quantity) {
    const { error: releaseError } = await service.rpc("ticket_checkout_cancel", { p_order_id: rpcData.order_id });
    if (releaseError) console.error("Invalid price reservation release failed:", releaseError);
    return jsonResponse(errorBody("INVALID_TICKET_PRICE", "Ticket price or currency is invalid"), 409, req);
  }
  // 5. Freeze the exact Stripe create request before calling Stripe.
  // Reuse this object (and the same idempotency key) after any lost response.
  const stripeParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    // Use Stripe Dashboard payment method settings to show eligible methods.
    line_items: [{
      price_data: {
        currency: chargeCurrency,
        product_data: {
          name: rpcData.ticket_name + " — " + rpcData.event_name,
          description: body.quantity + " × " + rpcData.ticket_name,
        },
        unit_amount: rpcData.price_cents,
      },
      quantity: body.quantity,
    }],
    customer_email: body.buyer_email,
    success_url: body.return_url_success,
    cancel_url: body.return_url_cancel,
    payment_intent_data: { metadata: { order_id: rpcData.order_id } },
    metadata: { order_id: rpcData.order_id },
  };
  const prepared: PreparedCheckout = {
    state: "prepared",
    request_hash: requestHash,
    order_id: rpcData.order_id,
    short_id: rpcData.short_id,
    access_token: accessToken,
    created_at_ms: Date.now(),
    stripe_params: stripeParams,
  };
  // The existing idempotency_keys table is service-controlled.
  // If this write fails, Stripe has NOT been called, so cancelling is safe.
  const { error: prepareError } = await service.from("idempotency_keys").upsert({
    key: body.idempotency_key, endpoint: ENDPOINT, response: prepared,
  }, { onConflict: "key" });
  if (prepareError) {
    console.error("Unable to save prepared Stripe checkout:", prepareError);
    const { error: releaseError } = await service.rpc("ticket_checkout_cancel", {
      p_order_id: rpcData.order_id,
    });
    if (releaseError) console.error("Reservation release after cache failure:", releaseError);
    return jsonResponse(errorBody("CHECKOUT_PREPARE_FAILED",
      "Unable to prepare recoverable Checkout"), 503, req);
  }
  return completePreparedCheckout(req, service, stripe, body.idempotency_key, prepared, true);
});
