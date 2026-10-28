import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { clientIpFromRequest, checkRateLimitDurable } from "@/lib/distributed-rate-limit";
import { venueLeadInputSchema } from "@/lib/partners/venue-lead-schema";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

/**
 * SAN-661 / SAN-882 · MKT — For Venues landing (/venues) inline lead form.
 *
 * Guest-friendly venue capture that persists exactly one lead per client
 * request. The client UUID is the lead primary key and idempotency key, and a
 * payload fingerprint prevents a replay from changing an earlier inquiry.
 * The existing Postgres-backed limiter protects the public form. No email or
 * message content is written to logs.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body", 400);
  }

  const parsed = venueLeadInputSchema.safeParse(body);
  if (!parsed.success) return fail("Please check your details", 400);
  const data = parsed.data;

  const service = createServiceRoleClient();
  if (!service) {
    console.error("[/api/partners/venue-leads] service role client unavailable");
    return fail("Lead capture unavailable", 503);
  }
  // Stable binding for the receipt closure below (keeps the non-null narrowing).
  const client = service;

  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        name: data.name,
        email: data.email.toLowerCase(),
        venueName: data.venueName,
        venueType: data.venueType,
        message: data.message ?? "",
        variant: data.variant ?? "default",
      }),
    )
    .digest("hex");

  // Only return a receipt for the same request. Never disclose lead contents.
  async function existingReceipt() {
    const { data: previous, error } = await client
      .from("leads")
      .select("id,metadata")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) return fail("Could not verify the saved request", 503);
    if (!previous) return null;
    const metadata = previous.metadata as Record<string, unknown> | null;
    if (
      metadata?.source_page !== "venues-landing" ||
      metadata?.request_fingerprint !== payloadHash
    ) {
      return fail("Request identifier already used", 409);
    }
    return NextResponse.json({
      success: true,
      leadId: previous.id,
      replayed: true,
      message: "Thanks — we'll be in touch within 1 business day.",
    });
  }

  const previous = await existingReceipt();
  if (previous) return previous;

  const ipHash = createHash("sha256").update(clientIpFromRequest(req)).digest("hex");
  const limit = await checkRateLimitDurable("venue-leads:ip:" + ipHash, 12, 3600);
  if (!limit.storeAvailable) return fail("Lead capture unavailable", 503);
  if (!limit.allowed) return fail("Too many requests. Please try later.", 429);

  // Optional identity: links the lead to a profile if the owner is signed in;
  // a logged-out guest still captures (user_id null).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: lead, error } = await client
    .from("leads")
    .insert({
      id: data.requestId,
      user_id: user?.id ?? null,
      idempotency_key: data.requestId,
      intent: "host",
      email: data.email,
      name: data.name,
      source: "form",
      status: "new",
      metadata: {
        partner_kind: "venue",
        venue_name: data.venueName,
        venue_type: data.venueType,
        message: data.message ?? null,
        page_variant: data.variant ?? "default",
        source_page: "venues-landing",
        request_fingerprint: payloadHash,
      },
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // A concurrent retry can win the PK race. Read the committed row and check
    // its fingerprint; never create a second row or claim success without one.
    return (await existingReceipt()) ?? fail("Could not verify the saved request", 503);
  }
  if (error || !lead) {
    console.error("[/api/partners/venue-leads] insert failed", error?.code);
    return fail("Could not save your request. Please retry.", 502);
  }

  // No email, name or message in logs.
  console.log("[venue-lead] id=" + lead.id + " type=" + data.venueType);

  return NextResponse.json({
    success: true,
    leadId: lead.id,
    replayed: false,
    message: "Thanks — we'll be in touch within 1 business day.",
  });
}
