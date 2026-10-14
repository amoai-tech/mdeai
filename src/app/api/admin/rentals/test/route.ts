import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePreferredAtInstant } from "@/lib/leads/schedule-viewing-time";

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
 *   POST -> { action: "create" | "clone-test" | "assign-test-operator" | "publish" | "cleanup", ... }
 */

type Gate =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; adminEmail: string }
  | { ok: false; status: number; message: string };

async function requireAdmin(): Promise<Gate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Sign in." };
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || !isAdmin) return { ok: false, status: 403, message: "Admin access required." };
  return { ok: true, supabase, adminEmail: user.email ?? "" };
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

// Accept the PostgreSQL UUID text shape without forcing a UUID version;
// malformed identifiers should fail before reaching the RPC argument cast.
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isIsoCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isHttpsImageUrl = (value: string) => {
  if (!value || /\s/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !!parsed.hostname
      && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
};

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  const { supabase } = gate;

  const columns = "id, title, neighborhood, address, price_monthly, currency, available_from, status, moderation_status, listing_workflow_status, verified, metadata, created_at";
  const { data, error } = await supabase
    .from("apartments")
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Preserve the newest 100 while keeping every older test fixture available
  // for Publish / Request viewing / Cleanup. Paginate to avoid the API row cap.
  const byId = new Map<string, RentalRow>(
    ((data ?? []) as RentalRow[]).map((row) => [row.id, row]),
  );
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data: fixtures, error: fixtureError } = await supabase
      .from("apartments")
      .select(columns)
      .eq("metadata->>is_test_fixture", "true")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (fixtureError) return NextResponse.json({ error: fixtureError.message }, { status: 500 });
    for (const row of (fixtures ?? []) as RentalRow[]) byId.set(row.id, row);
    if ((fixtures?.length ?? 0) < pageSize) break;
  }

  const rentals = [...byId.values()];
  const testIds = rentals.filter(isTestRow).map((r) => r.id);
  const counts: Record<string, { leads: number; showings: number }> = {};
  for (const id of testIds) counts[id] = { leads: 0, showings: 0 };

  if (testIds.length) {
    // The Data API caps each select (currently 1,000 rows). Count all pages
    // rather than silently undercounting requests beyond the first page.
    const loadIds = async (table: "leads" | "showings") => {
      const result: string[] = [];
      const pageSize = 200;
      for (let i = 0; i < testIds.length; i += 100) {
        const group = testIds.slice(i, i + 100);
        for (let offset = 0; ; offset += pageSize) {
          const { data: rows, error: countError } = await supabase
            .from(table)
            .select("apartment_id")
            .in("apartment_id", group)
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (countError) throw new Error("Could not load test viewing counts.");
          for (const row of rows ?? []) if (row.apartment_id) result.push(row.apartment_id);
          if ((rows?.length ?? 0) < pageSize) break;
        }
      }
      return result;
    };
    let leads: string[], showings: string[];
    try {
      [leads, showings] = await Promise.all([loadIds("leads"), loadIds("showings")]);
    } catch {
      return NextResponse.json({ error: "Could not load test viewing counts." }, { status: 500 });
    }
    for (const id of leads) if (counts[id]) counts[id].leads += 1;
    for (const id of showings) if (counts[id]) counts[id].showings += 1;
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
    const priceMonthly = body.priceMonthly != null &&
      (typeof body.priceMonthly === "number" || typeof body.priceMonthly === "string")
      ? Number(body.priceMonthly) : NaN;
    if (!title || !neighborhood || !address || !availableFrom || !imageUrl) {
      return NextResponse.json({ error: "title, neighborhood, address, availableFrom and imageUrl are required" }, { status: 400 });
    }
    if (!Number.isFinite(priceMonthly) || priceMonthly <= 0) {
      return NextResponse.json({ error: "priceMonthly must be a positive number" }, { status: 400 });
    }
    if (currency !== "COP" && currency !== "USD") {
      return NextResponse.json({ error: "currency must be COP or USD" }, { status: 400 });
    }
    if (!isIsoCalendarDate(availableFrom)) {
      return NextResponse.json({ error: "availableFrom must be a valid YYYY-MM-DD date" }, { status: 400 });
    }
    if (!isHttpsImageUrl(imageUrl)) {
      return NextResponse.json({ error: "imageUrl must be a valid HTTPS URL" }, { status: 400 });
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

  if (action === "clone-test") {
    const sourceId = typeof body.apartmentId === "string" ? body.apartmentId.trim() : "";
    const date = typeof body.availableFrom === "string" ? body.availableFrom.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!isUuid(sourceId) || !isIsoCalendarDate(date) || !isHttpsImageUrl(imageUrl)) {
      return NextResponse.json({ error: "Valid source, test date, and HTTPS test image required" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("admin_clone_rental_for_testing", {
      p_source_apartment_id: sourceId,
      p_available_from: date,
      p_test_image_url: imageUrl,
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

  if (action === "request-viewing") {
    const apartmentId = typeof body.apartmentId === "string" ? body.apartmentId.trim() : "";
    const wallClock = typeof body.preferredAt === "string" ? body.preferredAt.trim() : "";
    const at = resolvePreferredAtInstant(wallClock);
    if (!apartmentId || !at || new Date(at).getTime() <= Date.now() || !gate.adminEmail) {
      return NextResponse.json({ error: "Test apartment and future Medellín viewing time required" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("admin_request_test_viewing", {
      p_apartment_id: apartmentId,
      p_scheduled_at: at,
      p_email: gate.adminEmail,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const result = data as { lead?: { id?: string }; showing?: { id?: string }; idempotent_replay?: boolean } | null;
    if (!result?.lead?.id || !result.showing?.id) {
      return NextResponse.json({ error: "Test viewing did not commit a lead and showing" }, { status: 502 });
    }
    return NextResponse.json({ success: true, leadId: result.lead.id,
      showingId: result.showing.id, idempotentReplay: result.idempotent_replay === true });
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
