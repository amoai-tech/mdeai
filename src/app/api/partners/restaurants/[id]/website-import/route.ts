import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimitDurable } from "@/lib/distributed-rate-limit";
import { canAccessOwnerRestaurant, isAdminUser } from "@/lib/restaurants/restaurant-owner-load";
import {
  extractRestaurantWebsiteDraft,
  RestaurantWebsiteImportError,
} from "@/lib/restaurants/website-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

const schema = z.object({ url: z.string().trim().min(1).max(300) }).strict();

/**
 * SAN-1542 — propose listing changes from one public restaurant website.
 *
 * This route only reads. It never updates the restaurant: the operator reviews the
 * sourced suggestion in the existing editor and saves through the same authorized
 * PATCH route. Authentication is required so the import cannot be used as a
 * public scraping proxy.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid restaurant", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Unauthorized", 401);

  // Verify edit authority, not merely public read, before spending Gemini quota.
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id, partner_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("Could not load the restaurant", 500);
  if (!restaurant) return fail("Restaurant not found", 404);
  const [isAdmin, memberships] = await Promise.all([
    isAdminUser(supabase),
    supabase.from("partner_members").select("partner_id").eq("profile_id", user.id),
  ]);
  if (memberships.error) return fail("Could not verify business access", 500);
  if (!canAccessOwnerRestaurant({
    partnerId: restaurant.partner_id,
    authorizedPartnerIds: (memberships.data ?? []).map((member) => member.partner_id),
    isAdmin,
  })) return fail("You do not have access to this restaurant", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Enter the restaurant website address", 400);

  // Reuse the existing Postgres-backed per-user quota across serverless instances.
  // Never invoke the paid Gemini URL Context provider if the durable store fails.
  const limit = await checkRateLimitDurable("restaurant-website-import:user:" + user.id, 10, 3600);
  if (!limit.storeAvailable) return fail("Website analysis temporarily unavailable", 503);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: "Too many website checks. Please try later." } },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterSeconds))) } },
    );
  }

  try {
    const draft = await extractRestaurantWebsiteDraft(parsed.data.url);
    return NextResponse.json({ success: true, draft });
  } catch (error) {
    if (error instanceof RestaurantWebsiteImportError) {
      const status =
        error.code === "invalid_url"
          ? 400
          : error.code === "provider_unavailable"
            ? 503
            : error.code === "timeout"
              ? 504
              : 502;
      return fail(error.message, status);
    }
    console.error("[/api/partners/restaurants/:id/website-import] failed");
    return fail("Website import failed. Enter the details manually.", 500);
  }
}
