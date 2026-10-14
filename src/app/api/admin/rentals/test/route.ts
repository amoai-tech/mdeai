import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Administrator rental test mode (production).
 *
 * Server-gated by auth + the is_admin() RPC; the user-scoped client keeps RLS in
 * force for every read and for the admin-gated RPCs. Ordinary customers never
 * reach this route and never see test listings (rental_listing_is_public()
 * excludes fixtures).
 *
 *   GET  -> list rentals (with a test marker + test lead/showing counts)
 *   POST -> { action: "create" | "publish" | "cleanup", ... }
 */

type Gate =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; status: number; message: string };

async function requireAdmin(): Promise<Gate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Sign in." };
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || !isAdmin) return { ok: false, status: 403, message: "Admin access required." };
  return { ok: true, supabase };
}

type RentalRow = {
  id: string;
  title: string | null;
  neighborhood: string | null;
  address: string | null;
  price_monthly: number | null;
  currency: string | null;
  available_from: string | null;
  status: string;
  moderation_status: string;
  listing_workflow_status: string;
  verified: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const isTestRow = (row: RentalRow) =>
  String((row.metadata as Record<string, unknown> | null)?.is_test_fixture ?? "") === "true";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  const { supabase } = gate;

  const { data, error } = await supabase
    .from("apartments")
    .select(
      "id, title, neighborhood, address, price_monthly, currency, available_from, status, moderation_status, listing_workflow_status, verified, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rentals = (data ?? []) as RentalRow[];
  const testIds = rentals.filter(isTestRow).map((r) => r.id);
  const counts: Record<string, { leads: number; showings: number }> = {};
  for (const id of testIds) counts[id] = { leads: 0, showings: 0 };

  if (testIds.length) {
    const [{ data: leads }, { data: showings }] = await Promise.all([
      supabase.from("leads").select("apartment_id").in("apartment_id", testIds),
      supabase.from("showings").select("apartment_id").in("apartment_id", testIds),
    ]);
    for (const row of leads ?? []) {
      const id = row.apartment_id as string | null;
      if (id && counts[id]) counts[id].leads += 1;
    }
    for (const row of showings ?? []) {
      const id = row.apartment_id as string | null;
      if (id && counts[id]) counts[id].showings += 1;
    }
  }

  return NextResponse.json({ rentals, counts });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  const { supabase } = gate;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const action = body.action;

  if (action === "create") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const neighborhood = typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "COP";
    const availableFrom = typeof body.availableFrom === "string" ? body.availableFrom.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const priceMonthly = Number(body.priceMonthly);
    if (!title || !neighborhood || !address || !availableFrom || !imageUrl || !Number.isFinite(priceMonthly) || priceMonthly <= 0) {
      return NextResponse.json(
        { error: "title, neighborhood, address, priceMonthly, availableFrom and imageUrl are required" },
        { status: 400 },
      );
    }
    const { data, error } = await supabase.rpc("admin_create_test_rental", {
      p_title: title,
      p_neighborhood: neighborhood,
      p_address: address,
      p_price_monthly: priceMonthly,
      p_currency: currency,
      p_available_from: availableFrom,
      p_image_url: imageUrl,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rental: data });
  }

  if (action === "assign-test-operator") {
    const apartmentId = typeof body.apartmentId === "string" ? body.apartmentId.trim() : "";
    if (!apartmentId) return NextResponse.json({ error: "apartmentId is required" }, { status: 400 });
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
    const { data, error } = await supabase.rpc("admin_assign_rental_test_operator", {
      p_apartment_id: apartmentId,
      p_enabled: body.enabled,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rental: data });
  }

  if (action === "publish" || action === "cleanup") {
    const apartmentId = typeof body.apartmentId === "string" ? body.apartmentId.trim() : "";
    if (!apartmentId) return NextResponse.json({ error: "apartmentId is required" }, { status: 400 });
    const rpc = action === "publish" ? "admin_publish_test_rental" : "admin_cleanup_test_rental";
    const { data, error } = await supabase.rpc(rpc, { p_apartment_id: apartmentId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rental: data });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
