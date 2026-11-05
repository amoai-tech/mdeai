import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTicketCheckoutReturnUrls, trustedCheckoutOrigin } from "@/lib/tickets/checkout-return-url";
import {
  buildAttendeePayload,
  ticketCheckoutInputSchema,
} from "@/lib/tickets/ticket-checkout-schema";
import {
  getSupabaseAnonAuthHeaders,
  getSupabaseFunctionsBaseUrl,
} from "@/lib/supabase/edge-functions";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  const parsed = ticketCheckoutInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: { message: "Validation failed", details: parsed.error.flatten() },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  // Verify the buyer on the server before forwarding a session credential.
  // Anonymous buyers continue to receive token-based access to their tickets.
  const supabase = await createClient();
  // getSession is used only to find a candidate token; it does not grant ownership.
  // Both this server and the Edge Function verify it with auth.getUser().
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;
  if (accessToken) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ success: false, error: { message: "Sign-in session expired; please retry" } }, { status: 401 });
    }
  }
  let successUrl: string;
  let cancelUrl: string;
  try {
    const origin = trustedCheckoutOrigin(
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.VERCEL_URL,
      process.env.NODE_ENV === "production",
      process.env.VERCEL_ENV,
    );
    ({ successUrl, cancelUrl } = buildTicketCheckoutReturnUrls(
      origin, data.returnPath,
    ));
  } catch (error) {
    const code = error instanceof Error &&
      ["CHECKOUT_RETURN_PATH_INVALID", "CHECKOUT_ORIGIN_NOT_CONFIGURED",
        "CHECKOUT_ORIGIN_INVALID"].includes(error.message)
      ? error.message : "CHECKOUT_ORIGIN_INVALID";
    return NextResponse.json({
      success: false,
      error: {
        code,
        message: code === "CHECKOUT_RETURN_PATH_INVALID"
          ? "Invalid event return path"
          : code === "CHECKOUT_ORIGIN_NOT_CONFIGURED"
            ? "Checkout return origin is not configured"
            : "Checkout return origin is invalid",
      },
    }, { status: code === "CHECKOUT_RETURN_PATH_INVALID" ? 400 : 503 });
  }

  const edgeRes = await fetch(`${getSupabaseFunctionsBaseUrl()}/ticket-checkout`, {
    method: "POST",
    headers: getSupabaseAnonAuthHeaders(accessToken),
    body: JSON.stringify({
      event_id: data.eventId,
      ticket_id: data.ticketId,
      quantity: data.quantity,
      buyer_email: data.buyerEmail,
      buyer_name: data.buyerName,
      attendees: buildAttendeePayload(
        data.buyerEmail,
        data.buyerName,
        data.quantity,
      ),
      idempotency_key: data.idempotencyKey,
      return_url_success: successUrl,
      return_url_cancel: cancelUrl,
    }),
  });

  const edgeJson = (await edgeRes.json()) as {
    success?: boolean;
    data?: {
      stripe_session_url?: string;
      order_id?: string;
      short_id?: string | null;
      access_token?: string;
    };
    error?: { message?: string; code?: string };
  };

  if (
    !edgeRes.ok ||
    !edgeJson.success ||
    !edgeJson.data?.stripe_session_url ||
    !edgeJson.data.order_id ||
    !edgeJson.data.access_token
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: edgeJson.error?.message ?? "Ticket checkout failed",
          code: edgeJson.error?.code,
        },
      },
      { status: edgeRes.status >= 400 ? edgeRes.status : 502 },
    );
  }

  return NextResponse.json({
    success: true,
    stripeSessionUrl: edgeJson.data.stripe_session_url,
    orderId: edgeJson.data.order_id,
    shortId: edgeJson.data.short_id ?? null,
    walletAccessToken: edgeJson.data.access_token,
  });
}
