import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

const schema = z.object({ partnerId: z.string().uuid().nullable() }).strict();

/**
 * SAN-1540 — MDE Team assigns or reassigns a restaurant to a partner.
 *
 * `restaurant_assign_partner` requires `is_admin()` itself, so an ordinary
 * partner session can reach this route and still be denied by the database.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid restaurant", 400);

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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Choose a business", 400);

  const { data, error } = await supabase.rpc("restaurant_assign_partner", {
    p_restaurant_id: id,
    p_partner_id: parsed.data.partnerId,
  });

  if (error) {
    if (error.code === "42501") return fail("Only the MDE team can assign restaurants", 403);
    if (error.code === "P0002") return fail("Restaurant or business not found", 404);
    console.error("[/api/partners/restaurants/:id/assignment] failed", error.code);
    return fail("Could not assign the restaurant", 500);
  }

  const assigned = data as { restaurantId?: string; partnerId?: string | null } | null;
  if (!assigned?.restaurantId) return fail("Could not assign the restaurant", 500);

  return NextResponse.json({
    success: true,
    restaurantId: assigned.restaurantId,
    partnerId: assigned.partnerId ?? null,
  });
}
