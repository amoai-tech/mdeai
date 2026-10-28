import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, error: { message } }, { status });

const uuid = z.string().uuid();
const HTTP_URL = /^https?:\/\/\S+$/i;

const itemFields = {
  section: z.string().trim().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).nullable().optional(),
  priceAmount: z.number().min(0).max(100000000).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code").optional(),
  position: z.number().int().min(0).max(100000).optional(),
  sourceUrl: z
    .union([z.literal(""), z.string().trim().max(300).regex(HTTP_URL, "Enter a valid http(s) source URL")])
    .nullable()
    .optional(),
};

const createSchema = z.object(itemFields).strict();
const updateSchema = z
  .object({ itemId: uuid, ...itemFields, name: z.string().trim().min(1).max(160).optional() })
  .strict();
const deleteSchema = z.object({ itemId: uuid }).strict();

type MenuPatch = Partial<z.infer<typeof createSchema>> & { name?: string };

function toRow(patch: MenuPatch) {
  return {
    ...(patch.section !== undefined ? { section: patch.section || null } : {}),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description || null } : {}),
    ...(patch.priceAmount !== undefined ? { price_amount: patch.priceAmount } : {}),
    ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
    ...(patch.position !== undefined ? { position: patch.position } : {}),
    ...(patch.sourceUrl !== undefined ? { source_url: patch.sourceUrl || null } : {}),
  };
}

/**
 * SAN-1541 — owner-maintained menu rows.
 *
 * Authorization is the database: RLS only accepts rows whose parent restaurant is
 * assigned to the caller's partner. The route never accepts a partner id. An
 * editor cannot add a menu item to another restaurant by guessing its UUID.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the menu item", 400);

  const { data, error } = await supabase
    .from("restaurant_menu_items")
    .insert({ ...toRow(parsed.data), restaurant_id: id })
    .select("id, restaurant_id, section, name, description, price_amount, currency, position, source_url")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("You cannot edit this restaurant's menu", 403);
    console.error("[/api/partners/restaurants/:id/menu] create failed", error.code);
    return fail("Could not add the menu item", 500);
  }
  if (!data) return fail("Could not add the menu item", 500);

  return NextResponse.json({ success: true, item: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the menu item", 400);
  const { itemId, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return fail("Nothing to update", 400);

  const { data, error } = await supabase
    .from("restaurant_menu_items")
    .update(toRow(patch))
    .eq("id", itemId)
    .eq("restaurant_id", id)
    .select("id, restaurant_id, section, name, description, price_amount, currency, position, source_url")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("You cannot edit this restaurant's menu", 403);
    console.error("[/api/partners/restaurants/:id/menu] update failed", error.code);
    return fail("Could not update the menu item", 500);
  }
  if (!data) return fail("Menu item not found for this restaurant", 404);

  return NextResponse.json({ success: true, item: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return fail("Choose a menu item", 400);

  const { data, error } = await supabase
    .from("restaurant_menu_items")
    .delete()
    .eq("id", parsed.data.itemId)
    .eq("restaurant_id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("You cannot edit this restaurant's menu", 403);
    console.error("[/api/partners/restaurants/:id/menu] delete failed", error.code);
    return fail("Could not remove the menu item", 500);
  }
  if (!data) return fail("Menu item not found for this restaurant", 404);

  return NextResponse.json({ success: true, itemId: data.id });
}
