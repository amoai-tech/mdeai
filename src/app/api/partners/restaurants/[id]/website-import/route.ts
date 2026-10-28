import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
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

  // Prove the caller can already read this restaurant before spending a provider call.
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("Could not load the restaurant", 500);
  if (!restaurant) return fail("Restaurant not found", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Enter the restaurant website address", 400);

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
