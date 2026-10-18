import { NextResponse } from "next/server";

import { partnerProfileUpdateSchema } from "@/lib/partners/partner-profile-schema";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

/**
 * SAN-814 — a signed-in partner updates only their own business profile.
 * Authorization is the existing Supabase Auth session plus partner_members RLS;
 * this route never accepts a partner id from the client.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body", 400);
  }
  const parsed = partnerProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check your details", 400);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("partner_members")
    .select("partner_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (membershipError) {
    console.error("[/api/partners/profile] membership lookup failed", membershipError.code);
    return fail("Could not load your partner profile", 500);
  }
  if (!membership) return fail("No partner profile for this account", 404);

  const { data: current, error: readError } = await supabase
    .from("partners")
    .select("id, settings")
    .eq("id", membership.partner_id)
    .maybeSingle();
  if (readError || !current) return fail("Could not load your partner profile", 500);

  const settings = { ...((current.settings ?? {}) as Record<string, unknown>) };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) settings[key] = value;
  }

  const { data: updated, error: updateError } = await supabase
    .from("partners")
    .update({ settings })
    .eq("id", current.id)
    .select("id, settings")
    .maybeSingle();

  if (updateError || !updated) {
    console.error("[/api/partners/profile] update failed", updateError?.code);
    return fail("Could not save your profile", 500);
  }

  return NextResponse.json({
    success: true,
    partnerId: updated.id,
    settings: updated.settings,
  });
}
