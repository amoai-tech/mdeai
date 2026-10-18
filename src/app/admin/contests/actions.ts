"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminContest,
  linkAdminRestaurant,
  unlinkAdminRestaurant,
  updateAdminContest,
  type ContestStatus,
} from "@/lib/restaurants/contest-admin";

const STATUSES: readonly ContestStatus[] = ["draft", "live", "closed", "archived"];

/**
 * Every action re-checks the session and the admin role server-side. The browser can never
 * choose the actor: it comes from the verified Supabase session, and the RPC re-checks it too.
 */
async function requireAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in as an admin to manage contests.");
  const { data } = await supabase.rpc("is_admin");
  if (data !== true) throw new Error("Admin access required.");
  return user.id;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createContestAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const title = text(formData, "title");
  if (!title) throw new Error("A contest title is required.");

  const created = await createAdminContest(actorId, {
    title,
    description: text(formData, "description") || null,
    requestId: text(formData, "request_id") || null,
  });

  revalidatePath("/admin/contests");
  redirect("/admin/contests/" + created.contest_id);
}

export async function updateContestAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const contestId = text(formData, "contest_id");
  if (!contestId) throw new Error("Missing contest.");

  const status = text(formData, "status");
  await updateAdminContest(actorId, contestId, {
    title: text(formData, "title") || null,
    description: formData.has("description") ? text(formData, "description") : null,
    status: STATUSES.includes(status as ContestStatus) ? (status as ContestStatus) : null,
    startsAt: text(formData, "starts_at") || null,
    endsAt: text(formData, "ends_at") || null,
  });

  revalidatePath("/admin/contests/" + contestId);
  revalidatePath("/admin/contests");
}

export async function linkRestaurantAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const contestId = text(formData, "contest_id");
  const restaurantId = text(formData, "restaurant_id");
  if (!contestId || !restaurantId) throw new Error("Choose a restaurant to add.");

  await linkAdminRestaurant(actorId, contestId, restaurantId);
  revalidatePath("/admin/contests/" + contestId);
}

export async function unlinkRestaurantAction(formData: FormData): Promise<void> {
  const actorId = await requireAdminId();
  const contestId = text(formData, "contest_id");
  const restaurantId = text(formData, "restaurant_id");
  if (!contestId || !restaurantId) throw new Error("Missing entry.");

  await unlinkAdminRestaurant(actorId, contestId, restaurantId);
  revalidatePath("/admin/contests/" + contestId);
}