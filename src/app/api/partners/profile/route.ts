import { NextResponse } from "next/server";
import { z } from "zod";

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
  const selector = z.object({ partnerId: z.string().uuid().optional() }).passthrough().safeParse(body);
  if (!selector.success) return fail("Invalid partner selection", 400);
  const { partnerId, ...patch } = selector.data;
  const parsed = partnerProfileUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check your details", 400);
  }

  // The RPC derives the partner from auth.uid(), locks the partner row and
  // merges the submitted fields atomically. It never accepts a trusted partner
  // id from this body; the optional selection is re-verified inside the RPC.
  const { data, error } = await supabase.rpc("partner_profile_patch", {
    p_patch: parsed.data,
    ...(partnerId ? { p_partner_id: partnerId } : {}),
  });

  if (error) {
    if (error.code === "42501") {
      return fail("You do not have access to this partner profile", 403);
    }
    if (error.code === "P0002") {
      return fail("No partner profile for this account", 404);
    }
    if (error.code === "P0003") {
      return fail("You belong to more than one partner. Choose a partner before saving.", 409);
    }
    if (error.code === "22023") {
      return fail("Please check your profile details", 400);
    }
    console.error("[/api/partners/profile] update failed", error.code);
    return fail("Could not save your profile", 500);
  }

  const updated = data as { partnerId?: string; settings?: unknown } | null;
  if (!updated?.partnerId || !updated.settings) {
    console.error("[/api/partners/profile] update returned no row");
    return fail("Could not save your profile", 500);
  }


  return NextResponse.json({
    success: true,
    partnerId: updated.partnerId,
    settings: updated.settings,
  });
}
