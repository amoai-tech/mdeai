import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

const schema = z.object({
  partnerId: z.string().uuid().nullable(),
  expectedPartnerId: z.string().uuid().nullable(),
  reason: z.string().trim().min(1).max(240),
}).strict();

/**
 * SAN-1540 — MDE Team assigns or reassigns a restaurant to a partner.
 *
 * The canonical restaurant_admin_transfer RPC derives auth.uid(), verifies the
 * super_admin role, locks the row and atomically audits changed assignments.
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

  const { data, error } = await supabase.rpc("restaurant_admin_transfer", {
    p_restaurant_id: id,
    p_partner_id: parsed.data.partnerId,
    p_expected_partner_id: parsed.data.expectedPartnerId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    if (error.code === "42501") return fail("Only the MDE team can assign restaurants", 403);
    if (error.code === "P0002") return fail("Restaurant or business not found", 404);
    if (error.code === "P0001") return fail("The assignment changed. Refresh and try again.", 409);
    if (error.code === "22023") return fail("Invalid assignment or reason", 400);
    console.error("[/api/partners/restaurants/:id/assignment] failed", error.code);
    return fail("Could not assign the restaurant", 500);
  }

  const assigned = data as { restaurantId?: string; partnerId?: string | null; changed?: boolean; auditId?: string } | null;
  if (!assigned?.restaurantId || assigned.partnerId !== parsed.data.partnerId ||
      (assigned.changed && !assigned.auditId)) return fail("Could not verify the saved assignment", 500);

  return NextResponse.json({
    success: true,
    restaurantId: assigned.restaurantId,
    partnerId: assigned.partnerId ?? null,
    changed: assigned.changed === true,
    auditId: assigned.auditId ?? null,
  });
}
