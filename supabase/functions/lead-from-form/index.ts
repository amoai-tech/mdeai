/**
 * lead-from-form — Landlord V1 D7.5.
 *
 * Renter clicks "Contact Host" on a rental Details surface, fills the reply fields
 * (name, when-moving, optional message), and submits. We:
 *
 *   1. Validate (Zod) + honeypot check + rate limit.
 *   2. Look up apartment → landlord_id → landlord_profiles.whatsapp_e164.
 *   3. Insert a `landlord_inbox` row (channel='form', structured_profile
 *      with the move-when answer + name).
 *   4. Return a saved lead ID; never expose the host phone to the renter.
 *
 * Auth: verify_jwt: false. Anon renters need to message hosts without
 * having to sign up first — that's a key insight from §1 of the V1 plan
 * (we minimise pre-message friction). The honeypot + rate limit + edge
 * function (instead of direct insert) are what guard against spam.
 *
 * Rate limit: 5 requests / 15 min / IP, durable. Conservative for V1
 * cohort (~25-50 listings, 100-200 leads target across the whole
 * platform). Bumps if real-world traffic flags it as too tight.
 */ import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, jsonResponse, errorBody } from "../_shared/http.ts";

/** Provided by the Supabase Edge runtime; declared here because it is not in the Deno types. */
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
import { getServiceClient } from "../_shared/supabase-clients.ts";
import { allowRateDurable } from "../_shared/rate-limit.ts";
import { loadTwilioConfig, sendWhatsApp } from "../_shared/twilio-whatsapp.ts";
import { renderNewLeadMessage } from "../_shared/lead-notify-templates.ts";
const PayloadSchema = z.object({
  apartment_id: z.string().uuid(),
  request_id: z.string().uuid(),
  email: z.string().email().max(254),
  /** Renter's name. Falls back to "Anonymous" if omitted. */ name: z.string().trim().min(1).max(60),
  /** When they want to move. Maps to landlord_inbox.structured_profile.move_when. */ move_when: z.enum([
    "now",
    "soon",
    "later"
  ]),
  /** Optional free-text note from the renter. */ message: z.string().max(1000).optional(),
  /** Honeypot field. Real users don't see it; bots fill it. We accept
   * ANY string here so the schema doesn't reject (and signal) the trap;
   * the suppress logic below handles non-empty values silently. */ website: z.string().optional(),
  /** Anon-session id from the client (header-or-body), used for per-session rate limit. */ anon_session_id: z.string().max(60).optional()
});
function clientIp(req: Request) {
  // Prefer the header the edge proxy sets itself; it cannot be spoofed by the caller.
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for");
  if (!fwd) return "unknown";
  // Leftmost is client-controlled. The rightmost entry is the address the closest trusted proxy
  // observed, so a caller cannot mint a fresh rate-limit bucket per request.
  const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : "unknown";
}
async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: getCorsHeaders(req)
    });
  }
  if (req.method !== "POST") {
    return jsonResponse(errorBody("METHOD_NOT_ALLOWED", "Use POST"), 405, req);
  }
  // 1. Parse + validate body. Reject malformed first so we don't waste
  // a rate-limit slot on garbage requests.
  let payload;
  try {
    const json = await req.json();
    payload = PayloadSchema.parse(json);
  } catch (err) {
    return jsonResponse(errorBody("INVALID_PAYLOAD", "Form payload didn't validate", err instanceof z.ZodError ? err.flatten() : String(err)), 400, req);
  }
  // 2. Honeypot — quietly accept-and-discard so bots don't probe for
  // the rejection signal. Status 200, no DB write, nothing in the
  // landlord's inbox. Returning 200 prevents bots from learning the
  // honeypot exists.
  if (payload.website && payload.website.length > 0) {
    return jsonResponse({
      success: true,
      data: {
        suppressed: true
      }
    }, 200, req);
  }
  // 3. Rate limit for new submissions. Two keys: per-IP (covers most bots) and per
  // anon-session (covers shared-IP cases like coworking + university WiFi).
  const service = getServiceClient();
  const replyEmail = payload.email.trim().toLowerCase();
  // Retries can follow a lost HTTP response even when the first insert committed.
  // A durable unique ID means we never send a second notification for the same inquiry.
  const { data: previous, error: priorErr } = await service.from("landlord_inbox")
    .select("id, apartment_id, renter_email")
    .eq("form_request_id", payload.request_id).maybeSingle();
  if (priorErr) {
    console.error("[lead-from-form] replay lookup failed:", priorErr);
    return jsonResponse(errorBody("REPLAY_LOOKUP_FAILED", "Could not check inquiry status"), 500, req);
  }
  if (previous) {
    if (previous.apartment_id !== payload.apartment_id || previous.renter_email !== replyEmail) {
      return jsonResponse(errorBody("REQUEST_ID_CONFLICT", "Inquiry identity mismatch"), 409, req);
    }
    return jsonResponse({ success: true, data: { lead_id: previous.id, replayed: true } }, 200, req);
  }
  const ip = clientIp(req);
  const ipRate = await allowRateDurable(service, `lead-from-form:ip:${ip}`, 5, 900, { failClosed: true });
  if (!ipRate.allowed) {
    return jsonResponse(errorBody("RATE_LIMITED", "Too many inquiries from this network. Wait 15 minutes.", {
      retry_after_seconds: ipRate.retry_after_seconds
    }), 429, req);
  }
  if (payload.anon_session_id) {
    const sessRate = await allowRateDurable(service, `lead-from-form:sess:${payload.anon_session_id}`, 20, 3600, { failClosed: true });
    if (!sessRate.allowed) {
      return jsonResponse(errorBody("RATE_LIMITED", "Too many inquiries from this session. Wait an hour.", {
        retry_after_seconds: sessRate.retry_after_seconds
      }), 429, req);
    }
  }
  return createInquiry(req, payload, service, replyEmail);
}

/**
 * Everything after request validation: resolve the apartment and its host, persist the inquiry,
 * and attempt the optional notification. Split out of handleRequest so each function stays small
 * enough to review in one screen.
 */
async function createInquiry(
  req: Request,
  payload: z.infer<typeof PayloadSchema>,
  service: ReturnType<typeof getServiceClient>,
  replyEmail: string,
): Promise<Response> {
  // 4. Look up the apartment + its landlord. Service role because the
  // caller is anon and the renter shouldn't need read access to
  // landlord_profiles.whatsapp_e164.
  const { data: apt, error: aptErr } = await service.from("apartments").select("id, title, neighborhood, city, landlord_id").eq("id", payload.apartment_id).maybeSingle();
  if (aptErr) {
    console.error("lead-from-form apartment lookup error:", aptErr);
    return jsonResponse(errorBody("APARTMENT_LOOKUP_FAILED", "Could not look up the listing"), 500, req);
  }
  if (!apt) {
    return jsonResponse(errorBody("APARTMENT_NOT_FOUND", "Listing was deleted or never existed"), 404, req);
  }
  // A development listing without a landlord still accepts an inquiry.
  // The nullable landlord_id makes it visible to admins for assignment/follow-up.
  const { data: landlord, error: landlordErr } = apt.landlord_id
    ? await service.from("landlord_profiles")
      .select("id, whatsapp_e164, display_name").eq("id", apt.landlord_id).maybeSingle()
    : { data: null, error: null };
  if (landlordErr) {
    console.error("lead-from-form landlord lookup error:", landlordErr);
    return jsonResponse(errorBody("LANDLORD_LOOKUP_FAILED", "Could not look up the host"), 500, req);
  }
  // A host with no WhatsApp number is still a host with an inbox. Saving the inquiry is the
  // product requirement; notifying is best-effort. Rejecting here lost the renter's message
  // entirely, which is why every Contact Host attempt failed for those listings.
  const notifyPhone = landlord?.whatsapp_e164 ?? null;
  // 5. INSERT landlord_inbox row. raw_message gets the user's note (or a
  // placeholder); structured_profile carries the form metadata so D8's
  // lead-classify can skip re-extraction for form-channel rows.
  const trimmed = payload.message?.trim() ?? "";
  const rawMessage = trimmed.length > 0 ? trimmed : `(no message — clicked Contact Host with move-when=${payload.move_when})`;
  const renterName = payload.name.trim();
  const { data: inboxRow, error: insertErr } = await service.from("landlord_inbox").insert({
    landlord_id: apt.landlord_id,
    apartment_id: apt.id,
    form_request_id: payload.request_id,
    channel: "form",
    renter_name: renterName,
    renter_email: replyEmail,
    raw_message: rawMessage,
    structured_profile: {
      source: "contact-host-form",
      move_when: payload.move_when,
      renter_name: renterName,
      apartment_title: apt.title,
      apartment_neighborhood: apt.neighborhood
    },
    status: "new"
  }).select("id").single();
  if (insertErr) {
    if (insertErr.code === "23505") {
      // Concurrent retry raced the first insert. Read back the committed row.
      const { data: replay } = await service.from("landlord_inbox")
        .select("id, apartment_id, renter_email").eq("form_request_id", payload.request_id).maybeSingle();
      if (replay && replay.apartment_id === apt.id && replay.renter_email === replyEmail) {
        return jsonResponse({ success: true, data: { lead_id: replay.id, replayed: true } }, 200, req);
      }
      return jsonResponse(errorBody("REQUEST_ID_CONFLICT", "Inquiry identity mismatch"), 409, req);
    }
    console.error("lead-from-form insert error:", insertErr);
    return jsonResponse(errorBody("INSERT_FAILED", "Inquiry could not be saved"), 500, req);
  }
  // 6. Fire WhatsApp notification fire-and-forget. Failures are LOGGED
  // ONLY — never block the request, never retry. The lead is already in
  // the inbox; landlord sees it on next dashboard open as a fallback.
  const notifyTask = notifyPhone ? fireWhatsAppNotification({
    landlordPhone: notifyPhone,
    landlordName: landlord?.display_name ?? "Anfitrión",
    renterName,
    apartmentTitle: apt.title,
    apartmentNeighborhood: apt.neighborhood,
    moveWhen: payload.move_when,
    messageSnippet: rawMessage,
    leadId: inboxRow.id,
    service
  }).catch((err)=>{
    console.warn("[lead-from-form] WhatsApp dispatch failed:", err);
  }) : null;
  // Supabase may shut the instance down once the response is returned; register the task so the
  // send (and the whatsapp_sent_at stamp) can finish.
  if (notifyTask) EdgeRuntime.waitUntil(notifyTask);
  return jsonResponse({
    success: true,
    data: {
      lead_id: inboxRow.id,
      // The host's number is not returned to an anonymous caller: it is personal data and the
      // renter does not need it — MDE delivers the inquiry to the host's inbox.
      notification_requested: Boolean(notifyPhone),
      landlord_display_name: landlord?.display_name ?? null,
      apartment: {
        id: apt.id,
        title: apt.title,
        neighborhood: apt.neighborhood
      }
    }
  }, 201, req);
}
async function fireWhatsAppNotification(args: {
  landlordPhone: string;
  landlordName: string;
  renterName: string;
  apartmentTitle: string;
  apartmentNeighborhood: string | null;
  moveWhen: "now" | "soon" | "later";
  messageSnippet: string;
  leadId: string;
  service: ReturnType<typeof getServiceClient>;
}) {
  const config = loadTwilioConfig(Deno.env.get("TWILIO_USE_SANDBOX") === "true");
  if (!config) {
    console.warn("[lead-from-form] Twilio config missing — skipping WhatsApp send");
    return;
  }
  const baseUrl = Deno.env.get("MDEAI_PUBLIC_URL") ?? "https://mdeai.co";
  const leadUrl = `${baseUrl}/app/rentals/inbox`;
  const body = renderNewLeadMessage({
    landlordFirstName: args.landlordName.trim().split(/\s+/)[0] || "Anfitrión",
    renterName: args.renterName,
    apartmentTitle: args.apartmentTitle,
    apartmentNeighborhood: args.apartmentNeighborhood,
    moveWhen: args.moveWhen,
    messageSnippet: args.messageSnippet,
    leadUrl
  });
  const result = await sendWhatsApp(config, {
    toE164: args.landlordPhone,
    body
  });
  if (result.ok) {
    console.log(`[lead-from-form] WhatsApp provider accepted notification — sid=${result.sid}`);
    // Stamp whatsapp_sent_at so the reminder tick won't re-fire as a
    // first-send. Best-effort; failure here is fine.
    await args.service.from("landlord_inbox").update({
      whatsapp_sent_at: new Date().toISOString()
    }).eq("id", args.leadId);
  } else {
    console.warn(`[lead-from-form] WhatsApp send failed — code=${result.errorCode} msg=${result.errorMessage}`);
  }
}

Deno.serve(handleRequest);
