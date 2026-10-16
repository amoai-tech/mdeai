import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { clientIpFromRequest, checkRateLimitDurable } from "@/lib/distributed-rate-limit";
import { contactLeadSchema } from "@/lib/partners/contact-lead-schema";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const response = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

/**
 * SAN-693: public marketing inquiry, NOT a renter viewing request.
 * The client-generated UUID is used as the lead PK as well as idempotency_key.
 * Existing public.leads PK makes retries atomic even for guests (whose user_id
 * is null). A fingerprint prevents a replay from changing inquiry contents.
 * No table, policy, privileged browser key or duplicate lead store is needed.
 */
export async function POST(req: Request) {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return response("Invalid request body", 400);
  }
  const parsed = contactLeadSchema.safeParse(input);
  if (!parsed.success) return response("Please check your details", 400);
  const data = parsed.data;
  const service = createServiceRoleClient();
  if (!service) return response("Contact service temporarily unavailable", 503);
  const client = service;

  const payloadHash = createHash("sha256")
    .update(JSON.stringify({
      name: data.name,
      email: data.email.toLowerCase(),
      partnerType: data.partnerType,
      businessName: data.businessName ?? "",
      message: data.message,
    }))
    .digest("hex");

  // Only return a receipt for the same request. Never disclose lead contents.
  async function existingReceipt() {
    const { data: previous, error } = await client
      .from("leads")
      .select("id,metadata")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) return response("Could not verify the saved request", 503);
    if (!previous) return null;
    const metadata = previous.metadata as Record<string, unknown> | null;
    if (metadata?.source_page !== "contact" || metadata?.request_fingerprint !== payloadHash) {
      return response("Request identifier already used", 409);
    }
    return NextResponse.json({ success: true, leadId: previous.id, replayed: true });
  }

  const previous = await existingReceipt();
  if (previous) return previous;

  // Existing Postgres-backed limiter: fail closed when durability is unavailable.
  const ipHash = createHash("sha256").update(clientIpFromRequest(req)).digest("hex");
  const limit = await checkRateLimitDurable(`contact-leads:ip:${ipHash}`, 12, 3600);
  if (!limit.storeAvailable) return response("Contact service temporarily unavailable", 503);
  if (!limit.allowed) return response("Too many requests. Please try later.", 429);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: lead, error } = await client.from("leads").insert({
    id: data.requestId,
    user_id: user?.id ?? null,
    idempotency_key: data.requestId,
    intent: "partner_inquiry",
    email: data.email,
    name: data.name,
    source: "form",
    status: "new",
    metadata: {
      source_page: "contact",
      partner_kind: data.partnerType,
      business_name: data.businessName || null,
      message: data.message,
      request_fingerprint: payloadHash,
    },
  }).select("id").single();

  if (error?.code === "23505") {
    // A concurrent retry can win the PK race. Read the committed row and check
    // its fingerprint; never create a second row or claim success without one.
    return (await existingReceipt()) ?? response("Could not verify the saved request", 503);
  }
  if (error || !lead) {
    console.error("[contact-leads] insert failed", error?.code);
    return response("Could not save your inquiry. Please retry.", 502);
  }
  return NextResponse.json({ success: true, leadId: lead.id, replayed: false });
}
