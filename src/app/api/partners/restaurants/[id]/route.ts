import { NextResponse } from "next/server";
import { z } from "zod";

import { restaurantListingPatchSchema } from "@/lib/restaurants/restaurant-owner-schema";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

const uuid = z.string().uuid();

/**
 * SAN-1540 — the single authorized save pathway for a restaurant listing.
 *
 * The caller's identity comes from the Supabase session. `partnerId` is only a
 * selector: `restaurant_owner_patch` requires it to equal the stored assignment
 * and to be a real membership of `auth.uid()`. The route never writes the table
 * directly and never accepts assignment or administrative fields.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) return fail("Invalid restaurant", 400);

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

  const selector = z
    .object({ partnerId: z.string().uuid().optional() })
    .passthrough()
    .safeParse(body);
  if (!selector.success) return fail("Invalid partner selection", 400);
  const { partnerId, ...patch } = selector.data;

  const parsed = restaurantListingPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the restaurant details", 400);
  }

  const { data, error } = await supabase.rpc("restaurant_owner_patch", {
    p_restaurant_id: id,
    p_patch: parsed.data,
    ...(partnerId ? { p_partner_id: partnerId } : {}),
  });

  if (error) {
    if (error.code === "42501") {
      return fail("You do not have access to this restaurant", 403);
    }
    if (error.code === "P0002") return fail("Restaurant not found", 404);
    if (error.code === "22023") {
      return fail(error.message.replace(/^restaurant_owner_patch:\s*/, ""), 400);
    }
    console.error("[/api/partners/restaurants/:id] update failed", error.code);
    return fail("Could not save the restaurant", 500);
  }

  const updated = data as
    | { restaurantId?: string; partnerId?: string; updatedAt?: string; listing?: unknown }
    | null;
  if (!updated?.restaurantId || !updated.listing) {
    console.error("[/api/partners/restaurants/:id] update returned no row");
    return fail("Could not save the restaurant", 500);
  }

  return NextResponse.json({
    success: true,
    restaurantId: updated.restaurantId,
    partnerId: updated.partnerId,
    updatedAt: updated.updatedAt,
    listing: updated.listing,
  });
}
