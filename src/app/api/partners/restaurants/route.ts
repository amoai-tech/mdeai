import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

const createSchema = z
  .object({
    partnerId: z.string().uuid(),
    name: z.string().trim().min(2).max(160),
    googlePlaceId: z.string().trim().max(256).optional(),
  })
  .strict();

/**
 * SAN-1540 — an authorized partner member creates a development listing for their
 * own partner account. No ownership paperwork, verification, approval or
 * publication gate applies in Phase A; the RPC only proves membership.
 */
export async function POST(req: Request) {
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Enter a restaurant name", 400);
  }

  const { data, error } = await supabase.rpc("restaurant_create_for_partner", {
    p_partner_id: parsed.data.partnerId,
    p_name: parsed.data.name,
    ...(parsed.data.googlePlaceId ? { p_google_place_id: parsed.data.googlePlaceId } : {}),
  });

  if (error) {
    if (error.code === "42501") return fail("You do not have access to this business", 403);
    if (error.code === "22023") {
      return fail(error.message.replace(/^restaurant_create_for_partner:\s*/, ""), 400);
    }
    if (error.code === "23505") {
      return fail("A restaurant with that Google Place ID already exists", 409);
    }
    console.error("[/api/partners/restaurants] create failed", error.code);
    return fail("Could not create the restaurant", 500);
  }

  const created = data as { restaurantId?: string } | null;
  if (!created?.restaurantId) {
    console.error("[/api/partners/restaurants] create returned no row");
    return fail("Could not create the restaurant", 500);
  }

  return NextResponse.json({ success: true, restaurantId: created.restaurantId });
}
